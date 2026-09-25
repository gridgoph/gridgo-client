import Constants from "expo-constants";
import { Platform } from "react-native";
import { create } from "zustand";

import * as api from "@/lib/api";
import { liveGeneration, assertLiveGeneration } from "@/lib/live";
import { withRequestDeadline } from "@/lib/requestDeadline";
import { useSession } from "@/store/session";
import { userFacingError } from "@/lib/copy";
import {
  devicePlatform,
  isExpoGoRuntime,
  PUSH_CHANNEL,
  PUSH_CHANNEL_ID,
  readPushPermission,
  type PushPermission,
} from "@/lib/push";

let deviceMutation: Promise<unknown> = Promise.resolve();
export function serializeDeviceMutation<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const execute = () => withRequestDeadline(undefined, run);
  const pending = deviceMutation.then(execute, execute);
  deviceMutation = pending.catch(() => undefined);
  return pending;
}

type NotificationsNative = typeof import("expo-notifications");

let notificationsNative: NotificationsNative | null | undefined;

/**
 * The native module, or null when it must not be loaded.
 *
 * Expo Go Android SDK 53 throws at **import time**. Never statically import
 * `expo-notifications` from a module that loads at launch or on public auth.
 * Skip Expo Go entirely; if a require still throws, push is simply off.
 */
export function getNotificationsNative(): NotificationsNative | null {
  if (notificationsNative !== undefined) return notificationsNative;
  if (
    isExpoGoRuntime({
      appOwnership: Constants.appOwnership,
      executionEnvironment: Constants.executionEnvironment,
    })
  ) {
    notificationsNative = null;
    return null;
  }
  try {
    // Metro evaluates this only when called. A throw costs push, never the app.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Must stay lazy: Expo Go can throw at import time.
    notificationsNative = require("expo-notifications") as NotificationsNative;
    return notificationsNative;
  } catch {
    notificationsNative = null;
    return null;
  }
}

/**
 * The one place `expo-notifications` is spoken to.
 *
 * Every rule this store applies lives in `lib/push.ts` and is unit-tested
 * without a native runtime; what is here is the plumbing that cannot be — the
 * channel, the permission dialog, the FCM token, and keeping the server's idea
 * of this phone in step with the phone's.
 *
 * Registration uses this client's API role context and session boundary.
 * Fleet reuse must adapt those as well as routes and permission-card placement.
 *
 * Three things that look like bugs and are not:
 *
 * - Registration happens only once permission is **granted**. A token from a
 *   phone that will not display a notification is a registration the server
 *   would send to and nothing would come of, and it would make sign-out's
 *   unregister asymmetric.
 * - Registration does **not** wait for a session. A customer that installs
 *   GRIDGO and never signs in is still a phone that has to hear "there is a new
 *   version, update your app", so a granted phone registers at launch with no
 *   bearer and the registration is *unclaimed*; signing in claims it. See
 *   `api.registerDeviceUnclaimed` — that route is provisional, so a deployment
 *   without it is a third outcome and not a failure anyone is shown.
 * - The native module is never statically imported. Expo Go Android SDK 53
 *   throws at **import time**, so a `try` around `getDevicePushTokenAsync`
 *   never runs if the file itself imported the module. `getNotificationsNative`
 *   skips Expo Go and treats a failed require as "push is off". A throw must
 *   cost push, never the app.
 */

/**
 * Where push can work at all.
 *
 * Web is deliberately out: the contract accepts a `web` platform, but browser
 * push needs a service worker and a VAPID key that this MVP does not ship, and
 * an enable card that leads nowhere is worse than no card. `lib/push.ts` keeps
 * the `web` value so a later build can turn this on without touching the
 * contract.
 */
export function pushSupported(os: string = Platform.OS): boolean {
  return os === "android" || os === "ios";
}

type PushState = {
  supported: boolean;
  permission: PushPermission;
  /** The FCM registration token this installation currently holds. */
  token: string | null;
  /**
   * Whether the last registration named the signed-in customer.
   *
   * False after an unclaimed launch registration, and again after sign-out. It
   * is what makes signing in re-register rather than trust a token that is on
   * the server under nobody's name.
   */
  claimed: boolean;
  /** A permission ask or a registration call is in flight. */
  busy: boolean;
  error: string | null;
  /** Read the OS's answer without asking for anything. */
  syncPermission: () => Promise<PushPermission>;
  /** Raise the system dialog, then register. Only ever called from a tap. */
  enable: () => Promise<boolean>;
  /** Launch, sign-in and token rotation all land here. No dialog is raised. */
  registerIfGranted: () => Promise<void>;
  /**
   * The app came back to the foreground: re-read the OS's answer and register
   * if it is now a yes. This is how a person who went to the phone's settings
   * from a blocked card comes back registered without tapping anything else.
   */
  resume: () => Promise<void>;
  /** Firebase reissued the token while the app was running. */
  adoptToken: (token: string) => Promise<void>;
  /**
   * Sign-out has already unregistered the token with the sign-out call. Forget
   * the claim, then put this phone back on the unclaimed list so GRIDGO can
   * still announce a new version to it.
   */
  release: () => Promise<void>;
};

/**
 * A deployment that has not opened unauthenticated registration yet.
 *
 * `401`/`403` is the answer today — `POST /devices` requires a bearer — and
 * `404`/`405` would be the answer if the route moves. None of them is something
 * a customer did, or can do anything about, so none reaches a screen: the phone
 * simply registers for real the moment somebody signs in.
 */
function isUnclaimedRouteAbsent(error: unknown): boolean {
  return (
    error instanceof api.ApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404 || error.status === 405)
  );
}

/**
 * Create the channel the server's messages name.
 *
 * Android 8+ downgrades or drops a message whose `channel_id` it does not know,
 * and Android 13's permission dialog does not appear until at least one channel
 * exists — so this runs before the first permission read, not before the first
 * notification.
 */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  const Notifications = getNotificationsNative();
  if (!Notifications) return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: PUSH_CHANNEL.name,
    description: PUSH_CHANNEL.description,
    // These are order deadlines and payment confirmations: worth a sound and a
    // heads-up banner, which is also what the server's `priority: high` asks for.
    importance: Notifications.AndroidImportance.HIGH,
  });
}

/** The raw FCM token for this installation, or null if it cannot be had. */
async function fetchToken(): Promise<string | null> {
  const Notifications = getNotificationsNative();
  if (!Notifications) return null;
  const { data } = await Notifications.getDevicePushTokenAsync();
  return typeof data === "string" && data ? data : null;
}

export const usePush = create<PushState>((set, get) => ({
  supported: pushSupported(),
  permission: "unknown",
  token: null,
  claimed: false,
  busy: false,
  error: null,

  syncPermission: async () => {
    if (!get().supported) return "unknown";
    const Notifications = getNotificationsNative();
    if (!Notifications) {
      set({ permission: "unknown" });
      return "unknown";
    }
    try {
      await ensureChannel();
      const permission = readPushPermission(await Notifications.getPermissionsAsync());
      set({ permission });
      return permission;
    } catch {
      // Expo Go on Android, or a build with no Firebase config. Push is simply
      // unavailable; the in-app list is unaffected and no card is drawn.
      set({ permission: "unknown" });
      return "unknown";
    }
  },

  enable: async () => {
    if (!get().supported || get().busy) return false;
    const Notifications = getNotificationsNative();
    if (!Notifications) return false;
    set({ busy: true, error: null });
    try {
      await ensureChannel();
      // The dialog. Android 13+ shows it once and a refusal is effectively
      // permanent, which is why nothing calls this except an explicit tap on a
      // card that has already said what will arrive.
      const permission = readPushPermission(await Notifications.requestPermissionsAsync());
      set({ permission });
      if (permission !== "granted") {
        set({ busy: false });
        return false;
      }
    } catch (e) {
      set({ busy: false, error: errorText(e) });
      return false;
    }
    set({ busy: false });
    await get().registerIfGranted();
    return get().permission === "granted";
  },

  registerIfGranted: async () => {
    const generation = liveGeneration();
    const state = get();
    if (!state.supported || useSession.getState().signingOut) return;

    const platform = devicePlatform();
    if (!platform) return;

    const permission =
      state.permission === "unknown" ? await get().syncPermission() : state.permission;
    if (permission !== "granted") return;

    // A bearer means the customer is signed in and this registration names them.
    // Without one the phone is registered unclaimed, so an announcement can
    // still reach a handset nobody has signed in on.
    const signedIn = Boolean(await api.getAuthToken().catch(() => null));
    if (generation !== liveGeneration() || useSession.getState().signingOut) return;

    set({ busy: true, error: null });
    try {
      const token = await fetchToken();
      if (!token) {
        set({ busy: false, error: "This phone did not return a notification token." });
        return;
      }
      // Idempotent by contract, so no comparison against the stored token is
      // worth the risk of skipping a call the server never actually received.
      assertLiveGeneration(generation);
      if (useSession.getState().signingOut) return;
      if (signedIn) set({ token });
      await serializeDeviceMutation(async (signal) => {
        assertLiveGeneration(generation);
        if (useSession.getState().signingOut) return;
        if (signedIn) await api.registerDevice(token, platform, signal);
        else await api.registerDeviceUnclaimed(token, platform, signal);
      });
      assertLiveGeneration(generation);
      if (useSession.getState().signingOut) return;
      set({ token, claimed: signedIn, busy: false, error: null });
    } catch (e) {
      if (generation !== liveGeneration() || useSession.getState().signingOut) return;
      if (!signedIn && isUnclaimedRouteAbsent(e)) {
        // The provisional route is not deployed here. Nothing is wrong and
        // nobody is told: the phone registers for real at the next sign-in.
        set({ busy: false, error: null });
        return;
      }
      // A failed registration costs push until the next launch; it must never
      // interrupt the sign-in or the screen that triggered it.
      set({ busy: false, error: errorText(e) });
    }
  },

  resume: async () => {
    // An `enable()` in flight owns this: the OS dialog backgrounds the app, and
    // its return is answered by the dialog's own result, not by this.
    if (!get().supported || get().busy) return;
    const permission = await get().syncPermission();
    if (permission === "granted") await get().registerIfGranted();
  },

  adoptToken: async (token) => {
    if (token === get().token) return;
    set({ token });
    await get().registerIfGranted();
  },

  release: async () => {
    set({ token: null, claimed: false, busy: false, error: null });
    // The bearer is already gone, so this re-registers the phone unclaimed —
    // it stops receiving the previous person's order updates and stays
    // reachable for an announcement. Silent either way; nobody signing out is
    // waiting on it.
    await get().registerIfGranted();
  },
}));

/**
 * Never a raw error code.
 *
 * `device_token_too_long` tells a client nothing, and this text can reach the
 * card. Codes go through the same mapping every other screen uses.
 */
function errorText(e: unknown): string {
  return userFacingError(
    e,
    "Could not turn on notifications for this phone. Your updates still arrive in the app.",
  );
}
