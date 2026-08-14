import { useAuth, useClerk } from "@clerk/expo";
import { useEffect } from "react";

import * as api from "@/lib/api";
import { roleAppLabel } from "@/lib/copy";
import { APP_ROLE, useSession } from "@/store/session";

/**
 * Clerk owns identity; gridgo-api still owns the client projection and role.
 * This hook joins those boundaries once, above every route.
 */
export function useClerkApiSession(): void {
  const { getToken, isLoaded, isSignedIn, sessionId } = useAuth();
  const { signOut } = useClerk();

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
      if (current.source === "clerk") current.clearSession();
      return;
    }
    // A deliberately selected local API session owns the request bearer until
    // it signs out; do not overwrite it with a concurrent identity refresh.
    if (current.source === "legacy") return;

    let cancelled = false;
    current.beginClerkSync();
    void (async () => {
      try {
        const user = await api.me();
        if (cancelled) return;
        if (user.role !== APP_ROLE) {
          await signOut();
          useSession
            .getState()
            .failClerkSync(
              `This account belongs to ${roleAppLabel(user.role)}. Sign in there instead — GRIDGO ships one app per role.`,
            );
          return;
        }
        useSession.getState().adoptClerkUser(user);
      } catch (error) {
        if (cancelled) return;
        const message = api.isNetworkFailure(error)
          ? `Your identity is verified, but GRIDGO cannot reach ${api.getApiBase()}. Check the API connection and try again.`
          : error instanceof Error
            ? error.message
            : "Your identity is verified, but GRIDGO could not load your client profile.";
        useSession.getState().failClerkSync(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, sessionId, signOut]);
}
