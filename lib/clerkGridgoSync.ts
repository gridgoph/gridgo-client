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

let currentGeneration = 0;
const activeSyncs = new Map<string | ClerkGetToken, Promise<ClerkBridgeResult>>();

export function invalidateClerkGridgoSync(): void {
  currentGeneration += 1;
  activeSyncs.clear();
}

async function loadClerkGridgoUser(getToken: ClerkGetToken): Promise<ClerkBridgeResult> {
  api.setTokenProvider(() => clerkSessionToken(getToken));
  useSession.getState().beginClerkSync();
  return bridgeClerkToGridgo({
    me: () => api.me({ ignoreUnauthorized: true }),
    activate: (input) => api.activateClerkClient(input),
    refreshToken: () => clerkSessionToken(getToken),
  });
}

async function applyClerkGridgoResult(
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
  } else {
    useSession.setState({ loading: false });
  }
  if (result.signOut) {
    try {
      await signOut();
    } catch {
      return;
    }
  }
}

export function syncClerkToGridgo(deps: {
  getToken: ClerkGetToken;
  signOut: () => Promise<unknown>;
  sessionId?: string | null;
}): Promise<ClerkBridgeResult> {
  const key = deps.sessionId ?? deps.getToken;
  const active = activeSyncs.get(key);
  if (active) return active;

  const generation = ++currentGeneration;
  const run = (async () => {
    const result = await loadClerkGridgoUser(deps.getToken);
    if (generation === currentGeneration) {
      await applyClerkGridgoResult(result, deps.signOut);
    }
    return result;
  })();
  let tracked!: Promise<ClerkBridgeResult>;
  tracked = run.finally(() => {
    if (activeSyncs.get(key) === tracked) activeSyncs.delete(key);
  });
  activeSyncs.set(key, tracked);
  return tracked;
}
