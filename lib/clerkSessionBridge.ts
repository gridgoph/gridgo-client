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
import { clientEmailUnavailableMessage, userFacingError } from "@/lib/copy";
import { needsClientProfile } from "@/lib/signup";

export type ClerkBridgeResult =
  | { kind: "adopt"; user: User; provisioned: boolean }
  | { kind: "needs_profile" }
  | { kind: "wrong_role"; role: string }
  | { kind: "error"; message: string; signOut: boolean };

export type ClerkBridgeDeps = {
  me: () => Promise<User>;
  activate: (input?: ClerkActivateInput) => Promise<User>;
  /** After activate writes gridgoRole, /auth/me needs a new JWT with that claim. */
  refreshToken?: () => Promise<string | null>;
  /**
   * Resolve a non-empty Clerk JWT before anything goes out, null when none
   * appeared. Without it a just-completed sign-in can send `/auth/me` and
   * activate with no Bearer at all, and gridgo-api answers both `401
   * unauthorized` — which used to reach the person as "your session expired".
   */
  awaitToken?: () => Promise<string | null>;
  profile?: ClerkActivateInput;
};

/** Which call failed. A 401 means opposite things on each. */
type BridgeStage = "me" | "activate";

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

/**
 * Clerk finished but never handed GRIDGO a token to send.
 *
 * Not an expiry: Clerk is signed in this second. Signing out of Clerk is the
 * only thing the person can do that changes the outcome, so say that.
 */
export const clerkTokenUnavailableMessage =
  "Clerk signed you in, but GRIDGO never received an identity token for that session. Sign out and try again.";

/**
 * Both `/auth/me` and activate refused a token that Clerk had just issued, so
 * the API verified nothing — an unknown authorized party, the wrong Clerk
 * instance, or a clock that disagrees. Again: the Clerk session is live, so
 * "sign in again" is advice the person cannot follow.
 */
export function clerkVerificationRejectedMessage(): string {
  return `Clerk signed you in, but GRIDGO could not verify that identity at ${getApiBase()}. Sign out and try again.`;
}

function mapFailure(error: unknown, stage: BridgeStage): ClerkBridgeResult {
  if (isNetworkFailure(error)) {
    return { kind: "error", message: unreachableMessage(), signOut: false };
  }
  if (stage === "activate" && error instanceof ApiError && error.status === 401) {
    return { kind: "error", message: clerkVerificationRejectedMessage(), signOut: false };
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

  // No request leaves without a Bearer. An unauthenticated `/auth/me` is an
  // ordinary `401 unauthorized`, indistinguishable from an unmapped identity,
  // so the bridge would "activate" with no Bearer either and read the second
  // 401 as a dead session.
  if (deps.awaitToken && !(await deps.awaitToken())) {
    return { kind: "error", message: clerkTokenUnavailableMessage, signOut: false };
  }

  try {
    user = await deps.me();
  } catch (error) {
    if (!isUnmappedAuthError(error)) return mapFailure(error, "me");
    try {
      const created = await deps.activate(deps.profile ?? {});
      provisioned = true;
      if (deps.refreshToken) await deps.refreshToken();
      try {
        user = await deps.me();
      } catch {
        user = created;
      }
    } catch (activateError) {
      return mapFailure(activateError, "activate");
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

export function wrongRoleMessage(_role: string): string {
  return clientEmailUnavailableMessage;
}
