import { useAuth, useClerk } from "@clerk/expo";
import { useEffect } from "react";

import * as api from "@/lib/api";
import { clerkSessionToken } from "@/lib/clerkSignIn";
import { bridgeClerkToGridgo, wrongRoleMessage } from "@/lib/clerkSessionBridge";
import { useSession } from "@/store/session";

/**
 * Clerk owns identity; gridgo-api still owns the client projection and role.
 * This hook joins those boundaries once, above every route.
 */
export function useClerkApiSession(): void {
  const { getToken, isLoaded, isSignedIn, sessionId } = useAuth();
  const { signOut } = useClerk();
  const clerkSyncNonce = useSession((state) => state.clerkSyncNonce);

  useEffect(() => {
    useSession.getState().registerIdentityLogout(async () => {
      await signOut();
    });
    return () => useSession.getState().registerIdentityLogout(null);
  }, [signOut]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      api.setTokenProvider(null);
      return;
    }
    // Fresh JWT each time: a cached leftover is often expired, and after
    // activate /auth/me needs gridgo_role. Do not null the provider in cleanup
    // — Clerk recreates getToken often, and that gap is how me/activate go
    // out with no Bearer (the phone's "session expired" on first paint).
    api.setTokenProvider(() => getToken({ skipCache: true }));
  }, [getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded) return;
    const current = useSession.getState();

    if (!isSignedIn || !sessionId) {
      if (current.source === "clerk" || current.pendingClerkProfile) current.clearSession();
      return;
    }
    // A deliberately selected local API session owns the request bearer until
    // it signs out; do not overwrite it with a concurrent identity refresh.
    if (current.source === "legacy") return;

    let cancelled = false;
    void (async () => {
      const token = await clerkSessionToken(getToken);
      if (cancelled) return;
      if (!token) {
        // Dead leftover (failed Google, expired cache): drop it quietly so
        // login can accept the password or Google tap the person just made.
        await signOut();
        return;
      }

      useSession.getState().beginClerkSync();
      const result = await bridgeClerkToGridgo({
        me: () => api.me({ ignoreUnauthorized: true }),
        activate: (input) => api.activateClerkClient(input),
        refreshToken: () => clerkSessionToken(getToken),
      });
      if (cancelled) return;

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
      useSession.getState().failClerkSync(result.message);
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, sessionId, signOut, clerkSyncNonce]);
}
