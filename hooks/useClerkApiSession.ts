import { useAuth, useClerk } from "@clerk/expo";
import { useEffect, useRef } from "react";

import * as api from "@/lib/api";
import { invalidateClerkGridgoSync, syncClerkToGridgo } from "@/lib/clerkGridgoSync";
import { awaitClerkSessionToken, releaseClerkSession } from "@/lib/clerkSignIn";
import { useLoginFlow } from "@/store/loginFlow";
import { useSession } from "@/store/session";
import { useSignupFlow } from "@/store/signupFlow";

/**
 * Clerk owns identity; gridgo-api still owns the client projection and role.
 * This hook joins those boundaries once, above every route.
 */
export function useClerkApiSession(): void {
  const { getToken, isLoaded, isSignedIn, sessionId } = useAuth();
  const { signOut } = useClerk();
  const clerkSyncNonce = useSession((state) => state.clerkSyncNonce);
  const signingOut = useSession((state) => state.signingOut);
  const loginStep = useLoginFlow((state) => state.step);
  const signupStep = useSignupFlow((state) => state.step);
  const syncedSessionId = useRef<string | null>(null);
  const clerkOwnerPresent = useRef(false);

  useEffect(() => {
    // Never rejects: the session store awaits this from `logout`,
    // and a Clerk "you are signed out" throw there used to stall sign-out.
    useSession.getState().registerIdentityLogout(async () => {
      await releaseClerkSession(signOut);
    });
    return () => useSession.getState().registerIdentityLogout(null);
  }, [signOut]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && !sessionId) {
      api.setTokenProvider(null);
      return;
    }
    // Fresh JWT each time: a cached leftover is often expired, and after
    // activate /auth/me needs gridgo_role. Do not null the provider in cleanup
    // — Clerk recreates getToken often, and that gap is how me/activate go
    // out with no Bearer (the phone's "session expired" on first paint).
    // Keep a leftover sessionId's provider too: login may adopt before
    // useAuth().isSignedIn flips, and nulling here would drop the Bearer.
    // `awaitClerkSessionToken` also swallows Clerk's "you are signed out"
    // throw, so a request that races a sign-out fails as unauthorized rather
    // than as an uncaught identity error, and it waits out the gap where a
    // freshly activated session has not minted its first JWT yet.
    api.setTokenProvider(() => awaitClerkSessionToken(getToken));
  }, [getToken, isLoaded, isSignedIn, sessionId]);

  useEffect(() => {
    if (!isLoaded) return;
    const current = useSession.getState();

    if (!isSignedIn && !sessionId) {
      if (clerkOwnerPresent.current) {
        invalidateClerkGridgoSync();
      }
      clerkOwnerPresent.current = false;
      syncedSessionId.current = null;
      if (current.signingOut) current.finishSigningOut();
      if (current.source === "clerk" || current.pendingClerkProfile) current.clearSession();
      return;
    }

    // Local sign-out has already dropped the GRIDGO user. Do not rebuild it
    // from a Clerk leftover that has not finished signing out yet — that is
    // how the previous person came back after a slow logout.
    if (current.signingOut) return;

    // A typed password / Google attempt is collecting a code. Do not join a
    // leftover Clerk identity to GRIDGO here — that leftover may be a rider
    // from the previous tap, and painting "email not available" onto the
    // code step is how a valid client email looked refused.
    if (loginStep !== "credentials" || signupStep !== "details") return;

    clerkOwnerPresent.current = true;
    if (syncedSessionId.current && sessionId && syncedSessionId.current !== sessionId) {
      invalidateClerkGridgoSync();
    }
    if (sessionId) syncedSessionId.current = sessionId;
    // A deliberately selected local API session owns the request bearer until
    // it signs out; do not overwrite it with a concurrent identity refresh.
    if (current.source === "legacy") return;

    let cancelled = false;
    void (async () => {
      // Nothing in here may reject. This runs above every route on launch, and
      // an unhandled Clerk rejection is the Metro "Unable to authenticate /
      // You are signed out" flood that hides real errors.
      try {
        // Wait for the token rather than probing once — on first paint Clerk
        // often has the session before it has a JWT, and signing out there
        // would throw away a session that was about to work.
        const token = await awaitClerkSessionToken(getToken);
        if (cancelled) return;
        if (!token) {
          // Dead leftover (failed Google, expired cache): drop it quietly so
          // login can accept the password or Google tap the person just made.
          await releaseClerkSession(signOut);
          return;
        }

        await syncClerkToGridgo({ getToken, signOut, sessionId });
      } catch {
        // The bridge already reported anything the person can act on.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, sessionId, signOut, clerkSyncNonce, signingOut, loginStep, signupStep]);
}
