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

type ClerkGridgoSyncResult = {
  generation: number;
  result: ClerkBridgeResult;
};

let currentGeneration = 0;

export async function loadClerkGridgoUser(
  getToken: ClerkGetToken,
): Promise<ClerkGridgoSyncResult> {
  const generation = ++currentGeneration;
  api.setTokenProvider(() => clerkSessionToken(getToken));
  useSession.getState().beginClerkSync();
  const result = await bridgeClerkToGridgo({
    me: () => api.me({ ignoreUnauthorized: true }),
    activate: (input) => api.activateClerkClient(input),
    refreshToken: () => clerkSessionToken(getToken),
  });
  return { generation, result };
}

export async function applyClerkGridgoResult(
  sync: ClerkGridgoSyncResult,
  signOut: () => Promise<unknown>,
): Promise<void> {
  if (sync.generation !== currentGeneration) return;

  const { result } = sync;
  if (result.kind === "adopt") {
    useSession.getState().adoptClerkUser(result.user, { provisioned: result.provisioned });
    return;
  }
  if (result.kind === "needs_profile") {
    useSession.getState().needClerkProfile();
    return;
  }
  if (result.kind === "wrong_role") {
    useSession.getState().failClerkSync(wrongRoleMessage(result.role));
    try {
      await signOut();
    } catch {
      return;
    }
    return;
  }
  const current = useSession.getState();
  if (!current.user && !current.pendingClerkProfile) {
    current.failClerkSync(result.message);
  }
  if (result.signOut) {
    try {
      await signOut();
    } catch {
      return;
    }
  }
}

export async function syncClerkToGridgo(deps: {
  getToken: ClerkGetToken;
  signOut: () => Promise<unknown>;
}): Promise<ClerkBridgeResult> {
  const sync = await loadClerkGridgoUser(deps.getToken);
  await applyClerkGridgoResult(sync, deps.signOut);
  return sync.result;
}
