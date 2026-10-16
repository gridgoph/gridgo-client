/*
  Voice calls between the client and the rider carrying their order
  (report 16B159C0, gridgo-client#233; gridgo-api `docs/CALLS_API.md`).

  Calls run inside the app over mobile data or Wi-Fi (WebRTC). Neither side
  ever sees the other's phone number: the API hands out a first name and a
  role, nothing else, and there is no dialler and no per-minute charge.

  The calling window is the API's, and it is exactly the window in which the
  delivery conversation is writable (`deliveryChat.status === "open"`). This
  module reads that answer and never works the window out from the order's
  state — the same rule `lib/deliveryChat.ts` keeps.

  Everything here is pure: what a call projection says, which phase a call is
  in, why it ended, and the words for each. The side effects (media, polling,
  ringing) live in `lib/callEngine.ts` and `store/call.ts`.
*/

import { deliveryChatOf } from "@/lib/deliveryChat";

export type CallPartyRole = "client" | "rider" | "supplier";

export type CallParty = { firstName: string; role: string };

/** Server states are open strings: an unknown one must never crash a screen. */
export type OrderCallState = "ringing" | "accepted" | "declined" | "missed" | "cancelled" | "ended";

export type OrderCall = {
  id: string;
  orderId: string;
  pair: string;
  state: OrderCallState | (string & {});
  caller: CallParty;
  callee: CallParty;
  /** True when this phone's account placed the call. */
  mine: boolean;
  createdAt: string;
  ringExpiresAt: string | null;
  acceptedAt: string | null;
  endedAt: string | null;
  leaseExpiresAt: string | null;
};

export type CallSignal =
  | { id: number; kind: "offer" | "answer"; sdp: string }
  | { id: number; kind: "ice"; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };

export type CallIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type CallIceConfig = {
  iceServers: CallIceServer[];
  expiresAt: string | null;
  relayAvailable: boolean;
};

/** The one pair this app takes part in. `pickup` is the shop and the rider. */
export const CALL_PAIR = "delivery";
/** How often a live call screen re-reads state and signals, SSE or not. */
export const CALL_POLL_MS = 2_000;
/** How often an accepted call renews this phone's lease. */
export const CALL_HEARTBEAT_MS = 20_000;
/** How long an ended call's outcome stays on screen before it closes itself. */
export const CALL_END_HOLD_MS = 2_500;

const TERMINAL = new Set(["declined", "missed", "cancelled", "ended"]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readParty(raw: unknown, fallback: string): CallParty {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    firstName: text(value.firstName)?.trim() ?? fallback,
    role: text(value.role) ?? "",
  };
}

/** A call projection, read defensively. Null when it is not one. */
export function readCall(raw: unknown): OrderCall | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = text(value.id);
  const orderId = text(value.orderId);
  const state = text(value.state);
  if (!id || !orderId || !state) return null;
  return {
    id,
    orderId,
    pair: text(value.pair) ?? CALL_PAIR,
    state,
    caller: readParty(value.caller, "Rider"),
    callee: readParty(value.callee, "Rider"),
    mine: value.mine === true,
    createdAt: text(value.createdAt) ?? new Date(0).toISOString(),
    ringExpiresAt: text(value.ringExpiresAt),
    acceptedAt: text(value.acceptedAt),
    endedAt: text(value.endedAt),
    leaseExpiresAt: text(value.leaseExpiresAt),
  };
}

export function readCalls(raw: unknown): OrderCall[] {
  return Array.isArray(raw) ? raw.map(readCall).filter((call): call is OrderCall => call != null) : [];
}

export function isTerminalCall(call: Pick<OrderCall, "state">): boolean {
  return TERMINAL.has(call.state);
}

export function isLiveCall(call: Pick<OrderCall, "state">): boolean {
  return call.state === "ringing" || call.state === "accepted";
}

/** The person on the other end of this call, from this phone's side. */
export function otherParty(call: Pick<OrderCall, "mine" | "caller" | "callee">): CallParty {
  return call.mine ? call.callee : call.caller;
}

/** What to call them. The API falls back to "Rider" itself when it has no clean first name. */
export function partyName(call: Pick<OrderCall, "mine" | "caller" | "callee"> | null | undefined): string {
  return call ? otherParty(call).firstName || "Your rider" : "Your rider";
}

/**
 * The incoming call this phone should ring for, if any.
 *
 * A push or an SSE pointer only says "look"; a stale or duplicate one must not
 * ring again. So this rings only for a call still `ringing`, placed by the
 * other side, whose deadline is still ahead.
 */
export function ringingIncoming(calls: OrderCall[], now: number = Date.now()): OrderCall | null {
  return (
    calls.find(
      (call) =>
        call.state === "ringing" &&
        !call.mine &&
        call.ringExpiresAt != null &&
        Date.parse(call.ringExpiresAt) > now,
    ) ?? null
  );
}

/** This phone's own live call on the order, if it has one (a lost response, say). */
export function liveOutgoing(calls: OrderCall[]): OrderCall | null {
  return calls.find((call) => call.mine && isLiveCall(call)) ?? null;
}

/**
 * The call the order screen should own up to having missed.
 *
 * Only the newest call counts: once anyone has called since, the miss is
 * answered. A call the client turned down themselves is not a miss.
 */
export function latestMissedCall(calls: OrderCall[]): OrderCall | null {
  let newest: OrderCall | null = null;
  for (const call of calls) {
    if (!newest || Date.parse(call.createdAt) > Date.parse(newest.createdAt)) newest = call;
  }
  if (!newest || newest.mine) return null;
  return newest.state === "missed" || newest.state === "cancelled" ? newest : null;
}

/** Whether the order's call window is open: the API's delivery conversation is writable. */
export function callWindowOpen(order: { deliveryChat?: unknown } | null | undefined): boolean {
  return deliveryChatOf(order)?.status === "open";
}

/** Whether the order can have calls at all, live or retained. */
export function orderHasCalls(order: { deliveryChat?: unknown } | null | undefined): boolean {
  return deliveryChatOf(order) != null;
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

/**
 * Where a call stands on this phone.
 *
 * - `preparing` — before the server has the call: the microphone, the request.
 * - `calling` / `ringing` — placed; the rider has not answered.
 * - `incoming` — the rider is calling this phone.
 * - `connecting` — answered; the audio path is being set up.
 * - `connected` — talking. The timer runs.
 * - `reconnecting` — the audio path dropped mid-call and is trying again.
 * - `ended` — over, with a reason.
 */
export type CallPhase =
  | "preparing"
  | "calling"
  | "ringing"
  | "incoming"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended";

/** The status line for a phase. `connected` shows the timer instead. */
export function phaseLabel(phase: CallPhase): string {
  switch (phase) {
    case "preparing":
    case "calling":
      return "Calling…";
    case "ringing":
      return "Ringing…";
    case "incoming":
      return "Incoming call";
    case "connecting":
      return "Connecting…";
    case "reconnecting":
      return "Reconnecting…";
    case "connected":
      return "Connected";
    default:
      return "Call ended";
  }
}

/** "0:07", "12:34", "1:02:03". */
export function formatCallDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------

export type CallEndReason =
  /** They turned it down. */
  | "declined"
  /** This phone called and nobody answered in time. */
  | "no_answer"
  /** They called this phone and it was not answered. */
  | "missed"
  /** This phone hung up, or cancelled before an answer. */
  | "ended_by_you"
  /** The call finished from their side or the server's. */
  | "ended"
  /** The audio path or this phone's connection to GRIDGO gave out. */
  | "network_lost"
  /** The delivery left the calling window, or the call is no longer this phone's. */
  | "unavailable";

/**
 * Why a call that reached a terminal state ended, as this phone should say it.
 *
 * The server says `ended` both for a hang-up and for a window that closed, so
 * the phone's own knowledge — it pressed End, or its audio path failed — is
 * what tells them apart.
 */
export function endReasonFor(input: {
  state: string;
  mine: boolean;
  endedByMe: boolean;
  connectionLost: boolean;
}): CallEndReason {
  if (input.endedByMe) return "ended_by_you";
  switch (input.state) {
    case "declined":
      // A callee who declines never sees an ending; the screen just closes.
      return input.mine ? "declined" : "ended_by_you";
    case "missed":
      return input.mine ? "no_answer" : "missed";
    case "cancelled":
      return input.mine ? "ended_by_you" : "missed";
    default:
      return input.connectionLost ? "network_lost" : "ended";
  }
}

export type CallEndCopy = {
  title: string;
  detail: string;
  icon: "phone-off" | "phone-missed" | "wifi-off";
  /** Offer to call again from the ending. */
  callAgain: boolean;
};

export function endCopy(reason: CallEndReason, name: string, durationMs: number | null): CallEndCopy {
  const length = durationMs != null && durationMs > 0 ? formatCallDuration(durationMs) : null;
  switch (reason) {
    case "declined":
      return {
        title: `${name} declined`,
        detail: "They may be driving. Send a message, or try again in a minute.",
        icon: "phone-off",
        callAgain: true,
      };
    case "no_answer":
      return {
        title: "No answer",
        detail: `${name} did not pick up. They will see that you called.`,
        icon: "phone-missed",
        callAgain: true,
      };
    case "missed":
      return {
        title: "Missed call",
        detail: `${name} called about your delivery.`,
        icon: "phone-missed",
        callAgain: true,
      };
    case "network_lost":
      return {
        title: "Connection lost",
        detail: "The call dropped. Check your mobile data or Wi-Fi, then call again.",
        icon: "wifi-off",
        callAgain: true,
      };
    case "unavailable":
      return {
        title: "Call ended",
        detail: "Calls are open only while your rider has the delivery.",
        icon: "phone-off",
        callAgain: false,
      };
    case "ended_by_you":
      return { title: "Call ended", detail: length ?? "", icon: "phone-off", callAgain: false };
    default:
      return {
        title: "Call ended",
        detail: length ? `${name} ended the call · ${length}` : `${name} ended the call.`,
        icon: "phone-off",
        callAgain: false,
      };
  }
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/** The API's `error` code, read off the body so this module never imports the client. */
export function callErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const body = (error as { body?: unknown }).body;
  if (body && typeof body === "object" && "error" in body) return String((body as { error: unknown }).error);
  return null;
}

export function callErrorStatus(error: unknown): number | null {
  const status = error && typeof error === "object" ? (error as { status?: unknown }).status : null;
  return typeof status === "number" ? status : null;
}

/** A refusal that means the call is not this phone's to carry on, rather than a blip. */
export function callGone(error: unknown): boolean {
  const code = callErrorCode(error);
  const status = callErrorStatus(error);
  return (
    status === 403 ||
    status === 404 ||
    status === 410 ||
    code === "call_not_active" ||
    code === "invalid_call_transition" ||
    code === "call_not_available"
  );
}

export type CallProblem = { title: string; body: string };

/** Why a call could not be placed, in words a client can act on. */
export function callStartProblem(error: unknown): CallProblem {
  const code = callErrorCode(error);
  if (code === "call_not_available" || code === "forbidden" || code === "order_not_found") {
    return {
      title: "Calls are closed for this order",
      body: "You can call your rider only while they have the delivery.",
    };
  }
  if (code === "call_already_active") {
    return {
      title: "There is already a call",
      body: "Your rider is calling you, or a call is still connecting. Try again in a moment.",
    };
  }
  if (code === "too_many_requests") {
    return {
      title: "Too many calls just now",
      body: "Wait a few minutes before calling again, or send your rider a message.",
    };
  }
  return {
    title: "The call did not go through",
    body: "Check your mobile data or Wi-Fi and try again.",
  };
}

// ---------------------------------------------------------------------------
// Fixed copy
// ---------------------------------------------------------------------------

/** Said wherever a call is offered, and on the call itself. */
export const CALL_PRIVACY_LINE = "Your phone number stays private. Calls are not recorded.";

export const CALL_UNSUPPORTED = {
  title: "Calls need the latest GRIDGO app from the download page",
  body: "This version of the app cannot make internet calls. You can still message your rider.",
  action: "Open the download page",
} as const;

export const CALL_MIC_EXPLAINER = {
  title: "Allow the microphone for calls",
  body: "GRIDGO uses your microphone only while you are on a call with your rider. Calls go over mobile data or Wi-Fi, and nobody sees your phone number.",
  action: "Continue",
} as const;

export const CALL_MIC_BLOCKED = {
  title: "The microphone is off for GRIDGO",
  body: "Turn on the microphone for GRIDGO in your phone's settings to talk on calls. You can still message your rider.",
  action: "Open settings",
} as const;

/** The missed-call notice on the order screen. */
export function missedCallNotice(call: OrderCall, now: Date | number = Date.now()): { title: string; detail: string } {
  const at = new Date(call.endedAt ?? call.createdAt);
  const time = at.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  const sameDay =
    at.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) ===
    new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  return {
    title: `Missed call from ${partyName(call)}`,
    detail: sameDay ? `At ${time}. Your rider tried to reach you.` : "Your rider tried to reach you.",
  };
}

/** Push types this feature adds (gridgo-api `docs/CALLS_API.md#push-and-inbox`). */
export const CALL_INCOMING_TYPE = "order_call_incoming";
export const CALL_MISSED_TYPE = "order_call_missed";

export function isCallNotificationType(type: string | null | undefined): boolean {
  return type === CALL_INCOMING_TYPE || type === CALL_MISSED_TYPE;
}

/** The order an incoming-call push is about, or null for any other push. */
export function callPushOrder(data: unknown): string | null {
  const source = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (source.type !== CALL_INCOMING_TYPE) return null;
  return typeof source.orderId === "string" && source.orderId.trim() ? source.orderId.trim() : null;
}
