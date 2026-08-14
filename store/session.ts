import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";
import { roleAppLabel, userFacingError } from "@/lib/copy";
import { signupInput, type SignupFields } from "@/lib/signup";
import { usePush } from "@/store/push";

/** Expected role for this binary — mismatched login is rejected. */
export const APP_ROLE = "client" as const;

type SessionState = {
  user: User | null;
  source: "legacy" | "clerk" | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  /** Create a client account and sign straight into it. */
  signUp: (fields: SignupFields) => Promise<void>;
  logout: () => Promise<void>;
  /** Domain identity projected after Clerk has issued a session token. */
  adoptClerkUser: (user: User) => void;
  beginClerkSync: () => void;
  failClerkSync: (message: string) => void;
  registerIdentityLogout: (logout: (() => Promise<void>) | null) => void;
  /** Drop the in-memory user. Routing reacts via Stack.Protected — no router calls here. */
  clearSession: () => void;
  clearError: () => void;
};

let identityLogout: (() => Promise<void>) | null = null;

export const useSession = create<SessionState>((set) => ({
  user: null,
  source: null,
  loading: false,
  error: null,
  clearError: () => set({ error: null }),
  clearSession: () =>
    set((state) => {
      if (state.source === "clerk") void identityLogout?.();
      return { user: null, source: null, loading: false };
    }),
  adoptClerkUser: (user) =>
    set({ user, source: "clerk", loading: false, error: null }),
  beginClerkSync: () => set({ loading: true, error: null }),
  failClerkSync: (message) =>
    set({ user: null, source: null, loading: false, error: message }),
  registerIdentityLogout: (logout) => {
    identityLogout = logout;
  },
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { user } = await api.login(email, password);
      if (user.role !== APP_ROLE) {
        await api.logout();
        // Same terminal state as sign-out / 401: no user. Root Stack.Protected
        // keeps the signed-in area unreachable; we stay on login with an error.
        set({
          user: null,
          loading: false,
          // Never the raw role value: "ops_admin" tells a person nothing.
          error: `This account belongs to ${roleAppLabel(user.role)}. Sign in there instead — GRIDGO ships one app per role.`,
        });
        return;
      }
      set({ user, source: "legacy", loading: false });
    } catch (e) {
      let message: string;
      if (e instanceof api.ApiError && e.status === 401) {
        message = "Wrong email or password.";
      } else if (api.isNetworkFailure(e)) {
        message = `Cannot reach the backend at ${api.getApiBase()}. Is gridgo-api running on the LAN?`;
      } else if (e instanceof Error) {
        message = e.message;
      } else {
        message = "Could not sign in. Check your connection and try again.";
      }
      set({ loading: false, error: message });
    }
  },
  signUp: async (fields) => {
    set({ loading: true, error: null });
    try {
      // The API returns a live token, so a new client lands inside the app
      // rather than being asked to type the password they just chose. Role is
      // always `client` here: this binary offers no other kind of account.
      const { user } = await api.signupClient(signupInput(fields));
      set({ user, source: "legacy", loading: false });
    } catch (e) {
      set({
        loading: false,
        error: api.isNetworkFailure(e)
          ? `Cannot reach the backend at ${api.getApiBase()}. Check your connection and try again.`
          : userFacingError(e, "Could not create the account. Check your details and try again."),
      });
    }
  },
  logout: async () => {
    // The device token rides along with the sign-out rather than being
    // unregistered separately: afterwards the bearer token is dead, so a phone
    // that signed out first could no longer authenticate the unregister and
    // would keep waking up for the previous person's orders. The server accepts
    // a sign-out with no token exactly as before, so a phone that never got one
    // is unaffected.
    //
    // Afterwards the phone goes back on the unclaimed list rather than off it
    // entirely: a customer that signs out has not uninstalled GRIDGO, and
    // "there is a new version" still has to reach it.
    const deviceToken = usePush.getState().token;
    try {
      await api.logout(deviceToken);
    } finally {
      await identityLogout?.();
      set({ user: null, source: null, loading: false });
      void usePush.getState().release();
    }
  },
}));

// Mid-session 401 (expired / invalid token) clears the same user flag logout
// does, so the root route guard — not individual screens — returns to login.
api.onUnauthorized(() => {
  useSession.getState().clearSession();
});
