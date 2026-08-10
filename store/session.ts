import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";
import { roleAppLabel, userFacingError } from "@/lib/copy";
import { signupInput, type SignupFields } from "@/lib/signup";

/** Expected role for this binary — mismatched login is rejected. */
export const APP_ROLE = "client" as const;
export const DEMO_EMAIL = "client@gridgo.local";

type SessionState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  /** Create a client account and sign straight into it. */
  signUp: (fields: SignupFields) => Promise<void>;
  logout: () => Promise<void>;
  /** Drop the in-memory user. Routing reacts via Stack.Protected — no router calls here. */
  clearSession: () => void;
  clearError: () => void;
};

export const useSession = create<SessionState>((set) => ({
  user: null,
  loading: false,
  error: null,
  clearError: () => set({ error: null }),
  clearSession: () => set({ user: null, loading: false }),
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
      set({ user, loading: false });
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
      set({ user, loading: false });
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
    await api.logout();
    set({ user: null });
  },
}));

// Mid-session 401 (expired / invalid token) clears the same user flag logout
// does, so the root route guard — not individual screens — returns to login.
api.onUnauthorized(() => {
  useSession.getState().clearSession();
});
