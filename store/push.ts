import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { create } from "zustand";

import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  devicePlatform,
  PUSH_CHANNEL,
  PUSH_CHANNEL_ID,
  readPushPermission,
  type PushPermission,
} from "@/lib/push";

/**
 * The one place `expo-notifications` is spoken to.
 *
 * Every rule this store applies lives in `lib/push.ts` and is unit-tested
 * without a native runtime; what is here is the plumbing that cannot be — the
 * channel, the permission dialog, the FCM token, and keeping the server's idea
 * of this phone in step with the phone's.
 *
 * **Reusable as-is by the supplier and rider apps.** Nothing in this file names
 * a client concept; the app-specific parts of push are the routes in
 * `pushTargetRoute` and where the enable card is drawn.
 *
 * Two things that look like bugs and are not:
 *
 * - Registration happens only once permission is **granted**. A token from a
 *   phone that will not display a notification is a registration the server
 *   would send to and nothing would come of, and it would make sign-out's
 *   unregister asymmetric.
 * - Every native call is wrapped. `getDevicePushTokenAsync` **throws** in Expo
 *   Go on Android — Expo removed remote push from Expo Go in SDK 53 — and this
 *   store is constructed at launch there too. A throw must cost push, never the
 *   app.
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
  /** A permission ask or a registration call is in flight. */
  busy: boolean;
  error: string | null;
  /** Read the OS's answer without asking for anything. */
  syncPermission: () => Promise<PushPermission>;
  /** Raise the system dialog, then register. Only ever called from a tap. */
  enable: () => Promise<boolean>;
  /** Launch, sign-in and token rotation all land here. No dialog is raised. */
  registerIfGranted: () => Promise<void>;
  /** Firebase reissued the token while the app was running. */
  adoptToken: (token: string) => Promise<void>;
  /** Sign-out has already unregistered the token; forget it locally. */
  clear: () => void;
};

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
  const { data } = await Notifications.getDevicePushTokenAsync();
  return typeof data === "string" && data ? data : null;
}

export const usePush = create<PushState>((set, get) => ({
  supported: pushSupported(),
  permission: "unknown",
  token: null,
  busy: false,
  error: null,

  syncPermission: async () => {
    if (!get().supported) return "unknown";
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
    const state = get();
    if (!state.supported || !api.getToken()) return;

    const platform = devicePlatform();
    if (!platform) return;

    const permission =
      state.permission === "unknown" ? await get().syncPermission() : state.permission;
    if (permission !== "granted") return;

    set({ busy: true, error: null });
    try {
      const token = await fetchToken();
      if (!token) {
        set({ busy: false, error: "This phone did not return a notification token." });
        return;
      }
      // Idempotent by contract, so no comparison against the stored token is
      // worth the risk of skipping a call the server never actually received.
      await api.registerDevice(token, platform);
      set({ token, busy: false, error: null });
    } catch (e) {
      // A failed registration costs push until the next launch; it must never
      // interrupt the sign-in or the screen that triggered it.
      set({ busy: false, error: errorText(e) });
    }
  },

  adoptToken: async (token) => {
    if (token === get().token) return;
    set({ token });
    await get().registerIfGranted();
  },

  clear: () => set({ token: null, busy: false, error: null }),
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
