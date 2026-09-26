import { useCheckoutPayment, useOrderPayment } from "@/store/checkoutPayment";
import { useNotifications } from "@/store/notifications";
import { setLiveOwner } from "@/lib/live";
import { clearBoardCache } from "@/lib/shopBoards";
import { clearListingCache } from "@/lib/listingCache";
import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";
import { CLERK_SIGNOUT_TIMEOUT_MS, withTimeout } from "@/lib/clerkSignIn";
import { clientEmailUnavailableMessage, userFacingError } from "@/lib/copy";
import { sessionWaitHold } from "@/lib/sessionWait";
import { signupInput, type SignupFields } from "@/lib/signup";
import { usePush, serializeDeviceMutation } from "@/store/push";

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
   * Cleared only by the next Sign in / Google / Sign up tap, never by Clerk
   * reporting signed-out — that flicker is how ranking flashed before Welcome.
   */
  signingOut: boolean;
  /**
   * Google browser-SSO has started and the native callback may still adopt.
   * Independent of `loading` so `endClerkSync` cannot dump onto Welcome.
   */
  ssoInFlight: boolean;
  /** Designed identity wait. Independent of the adopt latch. */
  sessionWait: "in" | "out" | null;
  /** Bump to retry the Clerk → API bridge without starting SSO again. */
  clerkSyncNonce: number;
  login: (email: string, password: string) => Promise<void>;
  /** Create a client account and sign straight into it. */
  signUp: (fields: SignupFields) => Promise<void>;
  logout: () => Promise<void>;
  /** Domain identity projected after Clerk has issued a session token. */
  adoptClerkUser: (user: User, options?: { provisioned?: boolean }) => void;
  /**
   * Replace the account projection in place, leaving identity alone.
   *
   * For a screen that has just corrected the account and already holds
   * GRIDGO's answer. It is not a sign-in: it never touches `source`, and it
   * does nothing when nobody is signed in, so a late response cannot resurrect
   * a session that has since been signed out.
   */
  setUser: (user: User) => void;
  /**
   * Re-read the account. Account does this every time it comes back into view,
   * because the screen that corrects the name is one tap away and this card is
   * where a wrong one gets noticed.
   */
  refresh: () => Promise<void>;
  beginClerkSync: (options?: { google?: boolean }) => void;
  /** Google cancelled, failed, or adopted — Welcome may show again. */
  clearSsoInFlight: () => void;
  clearSessionWait: () => void;
  /**
   * The Clerk → GRIDGO sync that owned `loading` is no longer running.
   *
   * `beginClerkSync` raises `loading`, and only a *result* used to lower it —
   * so a sync that was superseded, invalidated by sign-out, or interrupted by
   * Fast Refresh left `loading: true` with nothing alive to turn it off. The
   * store survives Fast Refresh, so that stuck flag outlived the screen that
   * caused it and read as "Signing in…" on a Sign In nobody could tap again.
   *
   * Idempotent, and it touches nothing but `loading`: it says the wait is
   * over, never who is signed in.
   */
  endClerkSync: () => void;
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

let accountReadSequence = 0;
let identityLogout: (() => Promise<void>) | null = null;

export const useSession = create<SessionState>((set) => ({
  user: null,
  source: null,
  loading: false,
  error: null,
  pendingClerkProfile: false,
  justProvisioned: false,
  signingOut: false,
  ssoInFlight: false,
  sessionWait: null,
  clerkSyncNonce: 0,
  clearSsoInFlight: () => set({ ssoInFlight: false, sessionWait: null }),
  clearSessionWait: () => set({ sessionWait: null }),
  clearError: () => set({ error: null }),
  finishSigningOut: () => set({ signingOut: false }),
  clearSession: () =>
    set((state) => {
      // Fire-and-forget, so a Clerk failure cannot leave the app signed in;
      // the registered logout is the one that swallows "already signed out".
      if (state.source === "clerk")
        void identityLogout?.().catch(() => undefined);
      return {
        user: null,
        source: null,
        loading: false,
        pendingClerkProfile: false,
        justProvisioned: false,
        signingOut: false,
        ssoInFlight: false,
        sessionWait: null,
      };
    }),
  adoptClerkUser: (user, options) =>
    set((state) =>
      state.signingOut
        ? {}
        : {
            user,
            source: "clerk",
            loading: false,
            error: null,
            pendingClerkProfile: false,
            justProvisioned: Boolean(options?.provisioned),
            signingOut: false,
            ssoInFlight: false,
            sessionWait: null,
          },
    ),
  setUser: (user) => {
    accountReadSequence++;
    set((state) => (state.user?.id === user.id ? { user } : {}));
  },
  refresh: async () => {
    const sequence = ++accountReadSequence;
    const ownerId = useSession.getState().user?.id;
    if (!ownerId) return;
    try {
      const user = await api.getAccount();
      if (sequence !== accountReadSequence) return;
      // Signing out while this was in flight wins. Restoring the previous
      // person here is the same bug the launch bridge guards `signingOut` for.
      useSession.setState((state) =>
        state.user?.id === user.id ? { user } : {},
      );
    } catch (error) {
      if (sequence !== accountReadSequence) return;
      if (error instanceof api.ApiError && error.status === 403 && useSession.getState().user?.id === ownerId) {
        const code = typeof error.body === "object" && error.body && "error" in error.body
          ? (error.body as { error?: string }).error
          : undefined;
        if (code === "account_suspended" || code === "account_removed") return;
        useSession.getState().clearSession();
      }
      // A 401 already clears the session through the unauthorized handler, and
      // anything else leaves the account as last known rather than emptying
      // the card because one request did not land.
    }
  },
  beginClerkSync: (options) =>
    set((state) =>
      state.signingOut
        ? {}
        : {
            loading: true,
            error: null,
            sessionWait: "in",
            ...(options?.google ? { ssoInFlight: true } : {}),
          },
    ),
  endClerkSync: () => set((state) => (state.loading ? { loading: false } : {})),
  failClerkSync: (message) =>
    set({
      user: null,
      source: null,
      loading: false,
      error: message,
      pendingClerkProfile: false,
      signingOut: false,
      ssoInFlight: false,
      sessionWait: null,
    }),
  needClerkProfile: () =>
    set((state) =>
      state.signingOut
        ? {}
        : {
            pendingClerkProfile: true,
            loading: false,
            error: null,
            ssoInFlight: false,
            sessionWait: null,
          },
    ),
  requestClerkSync: () =>
    set((state) => ({ clerkSyncNonce: state.clerkSyncNonce + 1, error: null })),
  clearJustProvisioned: () => set({ justProvisioned: false }),
  registerIdentityLogout: (logout) => {
    identityLogout = logout;
  },
  login: async (email, password) => {
    set({ loading: true, error: null, signingOut: false, sessionWait: "in" });
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
          sessionWait: null,
        });
        return;
      }
      set({ user, source: "legacy", loading: false, sessionWait: null });
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
      set({ loading: false, error: message, sessionWait: null });
    }
  },
  signUp: async (fields) => {
    set({ loading: true, error: null, signingOut: false, sessionWait: "in" });
    try {
      // The API returns a live token, so a new client lands inside the app
      // rather than being asked to type the password they just chose. Role is
      // always `client` here: this binary offers no other kind of account.
      const { user } = await api.signupClient(signupInput(fields));
      set({ user, source: "legacy", loading: false, sessionWait: null });
    } catch (e) {
      set({
        loading: false,
        sessionWait: null,
        error: api.isNetworkFailure(e)
          ? `Cannot reach the backend at ${api.getApiBase()}. Check your connection and try again.`
          : userFacingError(
              e,
              "Could not create the account. Check your details and try again.",
            ),
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
    const bearer = api.captureLogoutBearer();
    const serverLogout = withTimeout(
      serializeDeviceMutation(() =>
        withTimeout(api.logout(deviceToken, bearer), LOGOUT_API_TIMEOUT_MS),
      ),
      LOGOUT_API_TIMEOUT_MS,
    ).catch(() => undefined);
    api.setToken(null);
    const startedAt = Date.now();
    set({
      user: null,
      source: null,
      loading: false,
      pendingClerkProfile: false,
      justProvisioned: false,
      signingOut: true,
      ssoInFlight: false,
      sessionWait: "out",
      error: null,
    });
    usePush.setState({ claimed: false, busy: false });
    await serverLogout;
    await withTimeout(identity?.() ?? Promise.resolve(), CLERK_SIGNOUT_TIMEOUT_MS).catch(() => undefined);
    // The authenticated endpoint already leaves this installation unclaimed.
    if (!useSession.getState().user) usePush.setState({ claimed: false, busy: false });
    await sessionWaitHold(startedAt);
    if (useSession.getState().signingOut) useSession.setState({ sessionWait: null });
  },
}));

// Mid-session 401 drops the GRIDGO projection so signed-in routes unmount.
// It must not sign out of Clerk — the shop app keeps that session, and the
// next Sign in / Google tap (or the Clerk bridge) can adopt it. Signing Clerk
// out here is what trapped people on "Sign in again".
api.onUnauthorized(() => {
  const current = useSession.getState();
  if (current.source === "legacy") {
    current.clearSession();
    return;
  }
  useSession.setState((state) => ({
    user: null,
    loading: false,
    pendingClerkProfile: false,
    justProvisioned: false,
    signingOut: false,
    ssoInFlight: false,
    sessionWait: null,
    error: null,
    clerkSyncNonce: state.clerkSyncNonce + 1,
  }));
});

// Synchronous identity boundary: old inbox data is gone before new screens render.
useSession.subscribe((state, previous) => {
  if (state.user !== previous.user) accountReadSequence++;
  const id = state.user?.id ?? null;
  if (id === (previous.user?.id ?? null)) return;
  useCheckoutPayment.getState().reset();
  useOrderPayment.getState().reset();
  clearBoardCache();
  clearListingCache();
  useNotifications.getState().setOwner(id);
  setLiveOwner(id);
});
