/**
 * Join an adopted Clerk session to the GRIDGO client projection.
 *
 * Login must call this after adopt — bumping clerkSyncNonce alone leaves
 * `user` null when `useAuth().isSignedIn` is still false, so the form stays up.
 */

import * as api from "@/lib/api";
import { clerkSessionToken, type ClerkGetToken } from "@/lib/clerkSignIn";
import {
  bridgeClerkToGridgo,
  wrongRoleMessage,
  type ClerkBridgeResult,
} from "@/lib/clerkSessionBridge";
import { useSession } from "@/store/session";

export async function loadClerkGridgoUser(getToken: ClerkGetToken): Promise<ClerkBridgeResult> {
  api.setTokenProvider(() => clerkSessionToken(getToken));
  useSession.getState().beginClerkSync();
  return bridgeClerkToGridgo({
    me: () => api.me({ ignoreUnauthorized: true }),
    activate: (input) => api.activateClerkClient(input),
    refreshToken: () => clerkSessionToken(getToken),
  });
}

export async function applyClerkGridgoResult(
  result: ClerkBridgeResult,
  signOut: () => Promise<unknown>,
): Promise<void> {
  if (result.kind === "adopt") {
    useSession.getState().adoptClerkUser(result.user, { provisioned: result.provisioned });
    return;
  }
  if (result.kind === "needs_profile") {
    useSession.getState().needClerkProfile();
    return;
  }
  if (result.kind === "wrong_role") {
    await signOut();
    useSession.getState().failClerkSync(wrongRoleMessage(result.role));
    return;
  }
  if (result.signOut) await signOut();
  // A slower hook retry must not wipe a client login already applied.
  if (!useSession.getState().user) {
    useSession.getState().failClerkSync(result.message);
  }
}

export async function syncClerkToGridgo(deps: {
  getToken: ClerkGetToken;
  signOut: () => Promise<unknown>;
}): Promise<ClerkBridgeResult> {
  const result = await loadClerkGridgoUser(deps.getToken);
  await applyClerkGridgoResult(result, deps.signOut);
  return result;
}
