/**
 * Push notifications: everything decidable without the native module.
 *
 * `GET /notifications` and the SSE stream only reach a phone while the app is
 * open. Push is the third delivery leg — the server sends the same notification
 * record through FCM HTTP v1 to every device the owner has registered, so it
 * arrives with the app closed and the screen locked. See
 * `docs/OPERATIONAL_MODEL_V2_API.md` § "Push notifications" in **gridgo-api**
 * for the contract; it is authoritative and this file must not drift from it.
 *
 * Nothing here imports `expo-notifications`, so every rule below is unit-tested
 * without a native runtime. `store/push.ts` is the thin layer that does talk to
 * the module. Two of the three GRIDGO apps still have to be written: everything
 * in this file is reusable **except `pushTargetRoute`**, which names this app's
 * routes, and the copy, which names this app's audience.
 */

import { Platform } from "react-native";

/**
 * The Android channel the server names in every message.
 *
 * `android.notification.channel_id` is `gridgo_default` on the server side, and
 * **a message naming a channel the app has not created is downgraded or dropped
 * on Android 8+**. The channel must therefore exist before a token is ever
 * requested — which is also what makes the Android 13 permission dialog
 * appear at all, since it does not show until a channel exists.
 *
 * Keep this identifier identical in all three apps: it is the server's string,
 * not each app's.
 */
export const PUSH_CHANNEL_ID = "gridgo_default";

/** Channel presentation. Importance is high — these are SLA-bearing updates. */
export const PUSH_CHANNEL = {
  name: "Order updates",
  description:
    "Artwork checks, prices, payment confirmations and delivery progress for your print jobs.",
} as const;

/** The `platform` value `POST /devices` accepts. */
export type DevicePlatform = "android" | "ios" | "web";

/**
 * Map the runtime to the contract's platform value.
 *
 * The contract allows exactly `android`, `ios` and `web`; anything else is
 * `400 invalid_device_platform`. React Native reports `windows`/`macos` on
 * platforms this app does not ship to, so those are refused here rather than
 * being sent for the server to reject.
 */
export function devicePlatform(os: string = Platform.OS): DevicePlatform | null {
  if (os === "android" || os === "ios" || os === "web") return os;
  return null;
}

/**
 * The `data` map of an FCM message, as this app may read it.
 *
 * The keys are exactly `notificationId`, `type`, `orderId` and `at`, all
 * strings, and a key with no value is simply absent — a notification with no
 * order carries no `orderId`. The map is an allowlist on the server, so no
 * money or supplier-only field can appear here even if a future notification
 * record carries one. Nothing else in the payload is contractual, so nothing
 * else is read.
 */
export type PushData = {
  notificationId: string | null;
  type: string | null;
  orderId: string | null;
  at: string | null;
};

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  // Contractually always a string. A number would still be meaningful, and a
  // payload that has drifted must not crash a lock-screen tap.
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

/** Read an FCM `data` map defensively. Never throws — a tap must always land. */
export function parsePushData(raw: unknown): PushData {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    notificationId: readString(source, "notificationId"),
    type: readString(source, "type"),
    orderId: readString(source, "orderId"),
    at: readString(source, "at"),
  };
}

/**
 * Where a tapped notification opens. **App-specific** — the supplier and rider
 * apps map the same payload onto their own routes.
 *
 * "Tapping a notification opens the right screen, not just the app": an update
 * about a job opens that job. An update with no job behind it — or one whose
 * type this build has never heard of — opens the notification list, which is
 * the contract's own instruction for an unknown `type` and is always a screen
 * that can explain itself. The push carries no order state, so the order screen
 * fetches the order as it always does.
 */
export function pushTargetRoute(data: PushData): string {
  return data.orderId ? `/order/${data.orderId}` : "/(tabs)/notifications";
}

/**
 * Permission as this app reasons about it.
 *
 * Android 13+ requires an explicit runtime prompt and a refusal is effectively
 * permanent — the OS stops offering the dialog, so `blocked` is a genuinely
 * different state from `undetermined` and needs different words and a different
 * button. `unknown` is before the first read, including web and Expo Go where
 * there is nothing to read.
 */
export type PushPermission = "unknown" | "undetermined" | "granted" | "blocked";

/**
 * Fold the module's permission response into that.
 *
 * `granted` is the only positive: iOS `provisional` and Android's implicit
 * pre-13 grant both arrive as granted. Denied-but-askable stays `undetermined`
 * because the dialog can still be shown; denied-and-not-askable is `blocked`
 * and only the system settings screen can change it.
 */
export function readPushPermission(response: {
  granted?: boolean;
  status?: string;
  canAskAgain?: boolean;
}): PushPermission {
  if (response.granted || response.status === "granted") return "granted";
  if (response.status === "undetermined") return "undetermined";
  return response.canAskAgain === false ? "blocked" : "undetermined";
}

/** What the enable card should do, if anything. */
export type PushOffer = "hidden" | "ask" | "settings" | "retry";

/**
 * Whether to offer phone notifications, and how.
 *
 * The ask is never fired cold: this returns `ask` only so a **card** can be
 * drawn, and the OS dialog is raised from that card's button. A refusal on
 * Android 13+ cannot be taken back by the app, so once blocked the only honest
 * offer is a link to the phone's own settings — and it is still only an offer.
 * Granted or unsupported: nothing is shown, because there is nothing to gain
 * by showing it.
 *
 * `retry` is the exception to that silence. A phone that granted permission and
 * then failed to register is the worst state of the lot: it looks exactly like
 * a working one, and simply never rings. Nothing else in the app would ever say
 * so, so the card stays on screen and says it.
 *
 * **Signed out is an offer, not a silence.** A customer that installs GRIDGO
 * and does not sign in for a week still has to hear "there is a new version,
 * update your app", and on Android 13+ that is impossible unless the permission
 * has been asked for by then. So the door may ask. It may ask *only*: a
 * signed-out phone is never told it is blocked or that a registration failed,
 * because neither is something a person standing at a sign-in screen can act
 * on, and neither is about them yet.
 */
export function pushOffer(input: {
  supported: boolean;
  signedIn: boolean;
  permission: PushPermission;
  /** A permission ask or a registration call failed. */
  failed?: boolean;
}): PushOffer {
  if (!input.supported) return "hidden";
  if (!input.signedIn) return input.permission === "undetermined" ? "ask" : "hidden";
  if (input.failed) return input.permission === "blocked" ? "settings" : "retry";
  if (input.permission === "granted" || input.permission === "unknown") return "hidden";
  return input.permission === "blocked" ? "settings" : "ask";
}

/**
 * One line saying what will arrive, plus the verb on the button.
 *
 * "Explain in one line what they will receive" — a person deciding on a prompt
 * they can only answer once deserves to know it is their own jobs and not
 * marketing. **App-specific**: the supplier and rider apps name their own work.
 */
export function pushOfferCopy(
  offer: Exclude<PushOffer, "hidden">,
  signedIn: boolean = true,
): {
  title: string;
  body: string;
  action: string;
} {
  if (offer === "ask" && !signedIn) {
    // The door. Promising job updates here would be a lie — GRIDGO has no idea
    // whose phone this is yet — so it promises only what an unclaimed phone
    // actually gets, and says the rest follows sign-in.
    return {
      title: "Get GRIDGO news on this phone",
      body: "Turn this on now and GRIDGO can tell this phone when there is a new version to install. Once you sign in, updates about your jobs come the same way.",
      action: "Turn on notifications",
    };
  }
  if (offer === "retry") {
    return {
      title: "This phone is not registered for notifications",
      body: "Permission is on, but we could not register this phone, so nothing will reach it while GRIDGO is closed. Your updates still arrive in the app.",
      action: "Try again",
    };
  }
  if (offer === "settings") {
    return {
      title: "Notifications are off for GRIDGO",
      body: "Your phone is blocking them, so updates only appear while the app is open. Turn them on in your phone's settings.",
      action: "Open phone settings",
    };
  }
  return {
    title: "Get these on your phone",
    body: "We will notify this phone when your artwork is checked, your price is ready, a payment is confirmed, or your order is out for delivery — even with GRIDGO closed.",
    action: "Turn on notifications",
  };
}

/**
 * What a push should do when it lands while the app is open and in front of
 * the person.
 *
 * Nothing visible. The in-app list and its unread badge already carry every
 * notification — a push is the *same record*, and a banner over a screen that
 * is already showing it is the same thing announced twice. So the foreground
 * handler suppresses the banner, the tray entry, the sound and the badge, and
 * the arrival is spent refreshing the list instead. Backgrounded or closed,
 * this handler never runs and Android draws the server's own title and body.
 */
export const PUSH_FOREGROUND_BEHAVIOR = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
} as const;
