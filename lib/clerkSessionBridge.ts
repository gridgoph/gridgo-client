/**
 * Join a live Clerk session to the GRIDGO client projection.
 *
 * `/auth/me` 401 on a verified Clerk JWT means unmapped, not "sign out".
 * Activate creates or links the client, then `/auth/me` is the source of truth.
 */

import {
  ApiError,
  type ClerkActivateInput,
  getApiBase,
  isNetworkFailure,
  type User,
} from "@/lib/api";
import { roleAppLabel, userFacingError } from "@/lib/copy";
import { needsClientProfile } from "@/lib/signup";

export type ClerkBridgeResult =
  | { kind: "adopt"; user: User; provisioned: boolean }
  | { kind: "needs_profile" }
  | { kind: "wrong_role"; role: string }
  | { kind: "error"; message: string; signOut: boolean };

export type ClerkBridgeDeps = {
  me: () => Promise<User>;
  activate: (input?: ClerkActivateInput) => Promise<User>;
  profile?: ClerkActivateInput;
};

export function isUnmappedAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (typeof error.body === "object" && error.body && "error" in error.body) {
    return String((error.body as { error: string }).error);
  }
  return error.message || null;
}

function roleFromError(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  if (typeof error.body === "object" && error.body && "role" in error.body) {
    return String((error.body as { role: string }).role);
  }
  return undefined;
}

function isProfileRequiredError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 400) return false;
  const code = errorCode(error);
  return (
    code === "invalid_account_type" ||
    code === "organization_name_required" ||
    code === "name_required" ||
    code === "profile_incomplete"
  );
}

function unreachableMessage(): string {
  return `Your identity is verified, but GRIDGO cannot reach ${getApiBase()}. Check the API connection and try again.`;
}

function activateUnavailableMessage(): string {
  return "Your identity is verified, but this GRIDGO API cannot create a client profile from Google yet. Try again when the Clerk link is live, or sign in with email.";
}

function mapFailure(error: unknown): ClerkBridgeResult {
  if (isNetworkFailure(error)) {
    return { kind: "error", message: unreachableMessage(), signOut: false };
  }
  if (error instanceof ApiError && error.status === 403) {
    return { kind: "wrong_role", role: roleFromError(error) ?? "" };
  }
  if (error instanceof ApiError && error.status === 404) {
    return { kind: "error", message: activateUnavailableMessage(), signOut: false };
  }
  if (isProfileRequiredError(error)) {
    return { kind: "needs_profile" };
  }
  return {
    kind: "error",
    message:
      error instanceof Error
        ? userFacingError(error, error.message)
        : "Your identity is verified, but GRIDGO could not load your client profile.",
    signOut: false,
  };
}

function decideUser(user: User, provisioned: boolean): ClerkBridgeResult {
  if (user.role !== "client") return { kind: "wrong_role", role: user.role };
  if (needsClientProfile(user)) return { kind: "needs_profile" };
  return { kind: "adopt", user, provisioned };
}

export async function bridgeClerkToGridgo(deps: ClerkBridgeDeps): Promise<ClerkBridgeResult> {
  let user: User | null = null;
  let provisioned = false;

  try {
    user = await deps.me();
  } catch (error) {
    if (!isUnmappedAuthError(error)) return mapFailure(error);
    try {
      const created = await deps.activate(deps.profile ?? {});
      provisioned = true;
      try {
        user = await deps.me();
      } catch {
        user = created;
      }
    } catch (activateError) {
      return mapFailure(activateError);
    }
  }

  if (!user) {
    return {
      kind: "error",
      message: "Your identity is verified, but GRIDGO could not load your client profile.",
      signOut: false,
    };
  }

  return decideUser(user, provisioned);
}

export function wrongRoleMessage(role: string): string {
  return `This account belongs to ${roleAppLabel(role)}. Sign in there instead — GRIDGO ships one app per role.`;
}
