/**
 * Join an adopted Clerk session to the GRIDGO client projection.
 *
 * Login must call this after adopt — bumping clerkSyncNonce alone leaves
 * `user` null when `useAuth().isSignedIn` is still false, so the form stays up.
 */

import * as api from "@/lib/api";
import {
  awaitClerkSessionToken,
  clerkFreshSessionToken,
  clerkTokenProvider,
  type ClerkGetToken,
  type ClerkTokenWait,
} from "@/lib/clerkSignIn";
import {
  bridgeClerkToGridgo,
  wrongRoleMessage,
  type ClerkBridgeResult,
} from "@/lib/clerkSessionBridge";
import { useSession } from "@/store/session";

let currentGeneration = 0;
type ActiveClerkSync = {
  sessionId: string | null;
  promise: Promise<ClerkBridgeResult>;
};

let activeSync: ActiveClerkSync | null = null;

/**
 * Abandon whatever sync is in flight.
 *
 * Sign-out calls this, and so does a session id changing under us. The
 * abandoned run will find its generation stale and skip `applyClerkGridgoResult`
 * — which is right, but that is also the only place `loading` was ever lowered.
 * Nothing is left to own the flag, so this lowers it here: the moment a sync is
 * abandoned, the app is no longer waiting on one.
 *
 * This is the fix for a dead Sign In after signing out. `useClerkApiSession`
 * invalidates on the signed-out leg, orphaning a sync that had already raised
 * `loading`, and the login screen was disabling its button on that flag.
 */
export function invalidateClerkGridgoSync(): void {
  currentGeneration += 1;
  activeSync = null;
  useSession.getState().endClerkSync();
}

async function loadClerkGridgoUser(
  getToken: ClerkGetToken,
  tokenWait?: ClerkTokenWait,
): Promise<ClerkBridgeResult> {
  api.setTokenProvider(clerkTokenProvider(getToken));
  useSession.getState().beginClerkSync();
  return bridgeClerkToGridgo({
    // The one place that waits, and the only one allowed more than a single
    // mint: this runs straight after a Clerk step completes, and the client
    // needs a beat to swap the session in before it can mint that session's
    // first JWT. It is what stops `/auth/me` going out with no Bearer. The
    // wait costs nothing once a token exists — probe 0 reads the cache — so
    // only a genuinely empty session pays, and it pays twice, not five times.
    // Google's native return passes a longer cache-heavy wait: the JWT is
    // often not in cache for well over 3×150ms.
    awaitToken: () =>
      awaitClerkSessionToken(getToken, tokenWait ?? { attempts: 3, delayMs: 150 }),
    me: () => api.me({ ignoreUnauthorized: true }),
    activate: (input) => api.activateClerkClient(input),
    // Activate wrote `gridgo_role`; the cached JWT predates that claim, so
    // this is one of the two places a forced mint is the point.
    refreshToken: () => clerkFreshSessionToken(getToken),
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
  tokenWait?: ClerkTokenWait;
}): Promise<ClerkBridgeResult> {
  const sessionId = deps.sessionId ?? null;
  if (activeSync) {
    if (
      activeSync.sessionId === sessionId ||
      activeSync.sessionId === null ||
      sessionId === null
    ) {
      if (sessionId) activeSync.sessionId = sessionId;
      return activeSync.promise;
    }
    invalidateClerkGridgoSync();
  }

  const generation = ++currentGeneration;
  const run = (async () => {
    try {
      const result = await loadClerkGridgoUser(deps.getToken, deps.tokenWait);
      if (generation === currentGeneration) {
        await applyClerkGridgoResult(result, deps.signOut);
      }
      return result;
    } finally {
      // Whatever happened — a result, a throw, a network that never answered —
      // this generation is done waiting. Only the *current* generation may
      // lower the flag: a superseded run must not clear the wait belonging to
      // the sync that replaced it.
      if (generation === currentGeneration) {
        useSession.getState().endClerkSync();
      }
    }
  })();
  let owner!: ActiveClerkSync;
  const tracked = run.finally(() => {
    if (activeSync === owner) activeSync = null;
  });
  owner = { sessionId, promise: tracked };
  activeSync = owner;
  return tracked;
}
