import { useAuth, useClerk } from "@clerk/expo";
import { useEffect, useRef } from "react";

import * as api from "@/lib/api";
import { invalidateClerkGridgoSync, syncClerkToGridgo } from "@/lib/clerkGridgoSync";
import {
  awaitClerkSessionToken,
  CLERK_SSO_TOKEN_WAIT,
  clerkTokenProvider,
  releaseClerkSession,
} from "@/lib/clerkSignIn";
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
  const wasSigningOut = useRef(false);

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
    // Clerk's cached JWT, with a single forced mint only when the cache is
    // empty (a session that has just been swapped in) and one more only when
    // gridgo-api has answered 401 to a token we sent. `skipCache` on every
    // request was a Clerk FAPI round trip per API call — the multi-second
    // sign-in, and the throttled mints behind "GRIDGO never received an
    // identity token".
    // Do not null the provider in cleanup — Clerk recreates getToken often,
    // and that gap is how me/activate go out with no Bearer (the phone's
    // "session expired" on first paint). Keep a leftover sessionId's provider
    // too: login may adopt before useAuth().isSignedIn flips, and nulling here
    // would drop the Bearer. The provider also swallows Clerk's "you are
    // signed out" throw, so a request that races a sign-out fails as
    // unauthorized rather than as an uncaught identity error.
    api.setTokenProvider(clerkTokenProvider(getToken));
  }, [getToken, isLoaded, isSignedIn, sessionId]);

  useEffect(() => {
    if (!isLoaded) return;
    const current = useSession.getState();

    if (current.signingOut) {
      if (!wasSigningOut.current) {
        wasSigningOut.current = true;
        invalidateClerkGridgoSync();
      }
      if (!isSignedIn && !sessionId) {
        api.setTokenProvider(null);
        clerkOwnerPresent.current = false;
        syncedSessionId.current = null;
      }
      // Keep the latch until Sign in / Google / Sign up. Clerk reporting
      // signed-out here used to clear it, then a leftover session rebuilt the
      // client and flashed the ranking screen before Welcome.
      return;
    }
    wasSigningOut.current = false;

    // A refused identity (wrong app) already owns the login error. Joining
    // again would clear it and leave Signing you in up.
    if (current.error) return;

    // GRIDGO membership projection is authoritative; Clerk primary-role metadata
    // may name another membership of the same person.
    if (!isSignedIn && !sessionId) {
      if (clerkOwnerPresent.current) {
        invalidateClerkGridgoSync();
      }
      clerkOwnerPresent.current = false;
      syncedSessionId.current = null;
      if (current.source === "clerk" || current.pendingClerkProfile) current.clearSession();
      return;
    }

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
        // would throw away a session that was about to work. This runs once
        // per launch / session change, not per request, so it can afford to
        // be more patient than the bearer path.
        const token = await awaitClerkSessionToken(getToken, CLERK_SSO_TOKEN_WAIT);
        if (cancelled) return;
        if (!token) {
          // A Google return is signed in at Clerk before a JWT is cached.
          // Signing out here is what dumped a successful callback onto login.
          // If GRIDGO is already joining that session, leave it alone.
          if (useSession.getState().loading) return;
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
  }, [
    getToken,
    isLoaded,
    isSignedIn,
    sessionId,
    signOut,
    clerkSyncNonce,
    signingOut,
    loginStep,
    signupStep,
  ]);
}
