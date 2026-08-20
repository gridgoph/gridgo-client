import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";
import { CLERK_SIGNOUT_TIMEOUT_MS, withTimeout } from "@/lib/clerkSignIn";
import { clientEmailUnavailableMessage, userFacingError } from "@/lib/copy";
import { signupInput, type SignupFields } from "@/lib/signup";
import { usePush } from "@/store/push";

/** Expected role for this binary — mismatched login is rejected. */
export const APP_ROLE = "client" as const;

/** Do not wait on a hung API before the signed-in area is already gone. */
export const LOGOUT_API_TIMEOUT_MS = 2500;

type SessionState = {
  user: User | null;
  source: "legacy" | "clerk" | null;
  loading: boolean;
  error: string | null;
  /** Clerk is signed in but GRIDGO still needs account type (Google / unmapped). */
  pendingClerkProfile: boolean;
  /** True after activate created this session's client. Landing is Home; Settings still offers onboarding. */
  justProvisioned: boolean;
  /**
   * Local session is gone and Clerk sign-out may still be in flight.
   * The Clerk→GRIDGO bridge must not restore the previous person.
   */
  signingOut: boolean;
  /** Bump to retry the Clerk → API bridge without starting SSO again. */
  clerkSyncNonce: number;
  login: (email: string, password: string) => Promise<void>;
  /** Create a client account and sign straight into it. */
  signUp: (fields: SignupFields) => Promise<void>;
  logout: () => Promise<void>;
  /** Domain identity projected after Clerk has issued a session token. */
  adoptClerkUser: (user: User, options?: { provisioned?: boolean }) => void;
  beginClerkSync: () => void;
  failClerkSync: (message: string) => void;
  needClerkProfile: () => void;
  requestClerkSync: () => void;
  clearJustProvisioned: () => void;
  registerIdentityLogout: (logout: (() => Promise<void>) | null) => void;
  /** Drop the in-memory user. Routing reacts via Stack.Protected — no router calls here. */
  clearSession: () => void;
  clearError: () => void;
  finishSigningOut: () => void;
};

let identityLogout: (() => Promise<void>) | null = null;

export const useSession = create<SessionState>((set) => ({
  user: null,
  source: null,
  loading: false,
  error: null,
  pendingClerkProfile: false,
  justProvisioned: false,
  signingOut: false,
  clerkSyncNonce: 0,
  clearError: () => set({ error: null }),
  finishSigningOut: () => set({ signingOut: false }),
  clearSession: () =>
    set((state) => {
      // Fire-and-forget, so a Clerk failure cannot leave the app signed in;
      // the registered logout is the one that swallows "already signed out".
      if (state.source === "clerk") void identityLogout?.().catch(() => undefined);
      return {
        user: null,
        source: null,
        loading: false,
        pendingClerkProfile: false,
        justProvisioned: false,
        signingOut: false,
      };
    }),
  adoptClerkUser: (user, options) =>
    set({
      user,
      source: "clerk",
      loading: false,
      error: null,
      pendingClerkProfile: false,
      justProvisioned: Boolean(options?.provisioned),
      signingOut: false,
    }),
  beginClerkSync: () => set({ loading: true, error: null, signingOut: false }),
  failClerkSync: (message) =>
    set({
      user: null,
      source: null,
      loading: false,
      error: message,
      pendingClerkProfile: false,
      signingOut: false,
    }),
  needClerkProfile: () =>
    set({ pendingClerkProfile: true, loading: false, error: null }),
  requestClerkSync: () =>
    set((state) => ({ clerkSyncNonce: state.clerkSyncNonce + 1, error: null })),
  clearJustProvisioned: () => set({ justProvisioned: false }),
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
          error: clientEmailUnavailableMessage,
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
    // Leave the signed-in area first. Waiting on `/auth/logout` or Clerk
    // used to keep Account up for tens of seconds when the API was slow or
    // unreachable, and a leftover Clerk session could then be adopted as
    // whoever signed in last — not the next email typed.
    const deviceToken = usePush.getState().token;
    const identity = identityLogout;
    set({
      user: null,
      source: null,
      loading: false,
      pendingClerkProfile: false,
      justProvisioned: false,
      signingOut: true,
      error: null,
    });
    void usePush.getState().release();
    await Promise.all([
      withTimeout(api.logout(deviceToken), LOGOUT_API_TIMEOUT_MS).catch(() => undefined),
      withTimeout(identity?.() ?? Promise.resolve(), CLERK_SIGNOUT_TIMEOUT_MS).catch(
        () => undefined,
      ),
    ]);
  },
}));

// Mid-session 401 (expired / invalid token) clears the same user flag logout
// does, so the root route guard — not individual screens — returns to login.
api.onUnauthorized(() => {
  useSession.getState().clearSession();
});
