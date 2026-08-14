import { useAuth, useClerk } from "@clerk/expo";
import { useEffect } from "react";

import * as api from "@/lib/api";
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
    api.setTokenProvider(isSignedIn ? () => getToken() : null);
    return () => api.setTokenProvider(null);
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
    current.beginClerkSync();
    void (async () => {
      const result = await bridgeClerkToGridgo({
        me: () => api.me({ ignoreUnauthorized: true }),
        activate: (input) => api.activateClerkClient(input),
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
  }, [isLoaded, isSignedIn, sessionId, signOut, clerkSyncNonce]);
}
