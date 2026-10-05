/**
 * A shop asking for a later deadline, from the client's side.
 *
 * Contract: `docs/ORDER_RESCHEDULE_API.md` in gridgo-api
 * (gridgoph/gridgo-supplier#101). During production the shop may ask once for
 * more time, with a reason. The client has 24 hours to answer:
 *
 * - **Accept** — the same shop carries on and the new date becomes the order's.
 * - **Decline** — work stops and GRIDGO looks for another shop for the same
 *   item, specs and price. The client takes that shop or, as the last resort,
 *   a full refund.
 * - **No answer** — the original date stands and Operations follows up.
 *
 * Anything GRIDGO cannot settle automatically goes to Operations, and the
 * client is told Operations will contact them rather than shown a dead end.
 */

import type { Order, RescheduleRequest } from "@/lib/api";
import type { OrderNextAction } from "@/lib/orderState";

export const RESCHEDULE_HEADLINE = "Your shop asked for more time";

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** States in which a request can still matter to the job on the press. */
const PRODUCTION_STATES = ["production", "supplier_self_qc"];

export type RescheduleView =
  /** Waiting on the client's answer, inside the 24-hour window. */
  | { kind: "answer"; request: RescheduleRequest; proposed: string; original: string | null }
  /** Declined; another shop is on offer and its 15 minutes are still running. */
  | { kind: "offer"; request: RescheduleRequest; offerId: string; promiseBy: string; expiresAt: string }
  /** The offer ran out: check again for a fresh one. */
  | { kind: "offer_expired"; request: RescheduleRequest }
  /** Declined, and no other shop can print it as ordered by the client's date. */
  | { kind: "no_match"; request: RescheduleRequest }
  /** Operations has to settle it with the client and the shop. */
  | { kind: "operations"; request: RescheduleRequest }
  /** Nobody answered in time; the original date still applies. */
  | { kind: "expired"; request: RescheduleRequest };

function ms(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * What the order screen draws for the shop's request, or null when it has
 * nothing to say: no request, the date accepted (the order now carries it),
 * a new shop taken, a refund chosen, or Operations' resolution recorded.
 */
export function rescheduleView(
  order: Pick<Order, "rescheduleRequest" | "state">,
  now: number = Date.now(),
): RescheduleView | null {
  const request = order.rescheduleRequest;
  if (!request) return null;
  if (request.resolution && ["rematched", "refund_requested", "resolved"].includes(request.resolution)) return null;
  if (request.status === "operations_required" || request.resolution === "operations_required") {
    return { kind: "operations", request };
  }
  if (request.status === "pending") {
    const closes = ms(request.expiresAt);
    // The server records the expiry on its next sweep; the phone does not
    // offer an answer it would refuse in the meantime.
    if (Number.isFinite(closes) && now >= closes) {
      return PRODUCTION_STATES.includes(order.state) ? { kind: "expired", request } : null;
    }
    if (!request.proposedPromiseBy) return { kind: "operations", request };
    return { kind: "answer", request, proposed: request.proposedPromiseBy, original: request.originalPromiseBy };
  }
  if (request.status === "expired") {
    return PRODUCTION_STATES.includes(order.state) ? { kind: "expired", request } : null;
  }
  if (request.status === "declined") {
    if (request.resolution === "rematch_offered" && request.rematch) {
      const { id, promiseBy, expiresAt } = request.rematch;
      return now >= ms(expiresAt)
        ? { kind: "offer_expired", request }
        : { kind: "offer", request, offerId: id, promiseBy, expiresAt };
    }
    if (request.resolution === "no_match") return { kind: "no_match", request };
    return { kind: "operations", request };
  }
  return null;
}

/** "10:58 PM" in Davao: a short hold needs the time, not the date. */
export function holdUntilTime(value: string | null | undefined): string | null {
  const at = ms(value);
  if (!Number.isFinite(at)) return null;
  return new Date(at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

/** "21 hours left", "40 minutes left" — the answer window, at a glance. */
export function timeLeftLabel(until: string | null | undefined, now: number = Date.now()): string {
  const left = ms(until) - now;
  if (!Number.isFinite(left) || left <= 0) return "No time left";
  if (left >= 2 * HOUR) return `${Math.floor(left / HOUR)} hours left`;
  if (left >= HOUR) return "1 hour left";
  const minutes = Math.max(1, Math.ceil(left / MINUTE));
  return minutes === 1 ? "1 minute left" : `${minutes} minutes left`;
}

/** How much of the window is left, 0–1, for the track under the answer line. */
export function windowRemaining(
  request: Pick<RescheduleRequest, "requestedAt" | "expiresAt">,
  now: number = Date.now(),
): number {
  const start = ms(request.requestedAt);
  const end = ms(request.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(1, Math.max(0, (end - now) / (end - start)));
}

/** "2 days later", "1 day and 6 hours later" — how far the date moves. */
export function dateShiftLabel(from: string | null | undefined, to: string | null | undefined): string | null {
  const diff = ms(to) - ms(from);
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const hours = Math.round(diff / HOUR);
  if (hours < 1) return "Less than an hour later";
  if (hours < 24) return hours === 1 ? "1 hour later" : `${hours} hours later`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const dayPart = days === 1 ? "1 day" : `${days} days`;
  if (!rest) return `${dayPart} later`;
  return `${dayPart} and ${rest === 1 ? "1 hour" : `${rest} hours`} later`;
}

export const RESCHEDULE_DECLINE_CONFIRM = {
  question: "Decline the new date?",
  body: "Work on this order stops. GRIDGO looks for another shop to print the same thing at the same price, and you choose it or a full refund.",
  confirmLabel: "Decline the new date",
  cancelLabel: "Go back",
};

/** Home's docket and the order screen's one action. */
export function rescheduleNextAction(
  order: Pick<Order, "rescheduleRequest" | "state">,
  now: number = Date.now(),
): OrderNextAction | null {
  const view = rescheduleView(order, now);
  if (!view) return null;
  switch (view.kind) {
    case "answer":
      return {
        title: "Answer the new date request",
        body: `Your shop asked for more time. ${timeLeftLabel(view.request.expiresAt, now)} to accept or decline.`,
        tone: "warning",
        icon: "clock",
      };
    case "offer":
    case "offer_expired":
      return {
        title: "Choose the new shop or a refund",
        body: "You declined the new date. GRIDGO found another shop for the same item and price.",
        tone: "info",
        icon: "square-pen",
      };
    case "no_match":
      return {
        title: "Choose a full refund or check again",
        body: "You declined the new date, and no other shop can print it by your date right now.",
        tone: "info",
        icon: "square-pen",
      };
    default:
      return null;
  }
}

/** The wait line when Operations is the next step. */
export function rescheduleWaitingOn(
  order: Pick<Order, "rescheduleRequest" | "state">,
  now: number = Date.now(),
): string | null {
  const view = rescheduleView(order, now);
  if (view?.kind === "operations") {
    return "Your shop asked for more time. Operations will contact you to settle the date.";
  }
  if (view?.kind === "expired") {
    return "Your original ready date still applies. Operations will contact you about the shop's request.";
  }
  return null;
}

/**
 * The inbox rows `order_reschedule_*`, in the client's words. gridgo-api
 * writes one body for the client, the shop and Operations, so it speaks of
 * "the client"; these replace it. Null for any other type.
 */
export function rescheduleNotificationCopy(
  type: string | null | undefined,
): { title: string; body: string } | null {
  switch (type) {
    case "order_reschedule_requested":
      return { title: RESCHEDULE_HEADLINE, body: "Accept the new ready date or decline it within 24 hours." };
    case "order_reschedule_accepted":
      return { title: "New date accepted", body: "The same shop carries on. Your order shows the new ready date." };
    case "order_reschedule_declined":
      return { title: "New date declined", body: "Work is paused. Open the order to see what GRIDGO found next." };
    case "order_reschedule_expired":
      return { title: "The time to answer passed", body: "Your original ready date still applies. Operations will contact you." };
    case "order_reschedule_operations_required":
      return { title: "Operations will contact you", body: "They settle the date change with you and the shop. Nothing on your order changes until then." };
    case "order_reschedule_rematch_refreshed":
      return { title: "Shops checked again", body: "Open the order for what is available now." };
    case "order_reschedule_rematched":
      return { title: "New shop on your order", body: "Same item, same specs, same price. The new shop confirms the job next." };
    case "order_reschedule_refund_requested":
      return { title: "Full refund requested", body: "Operations reviews it and sends what you paid to your receiving QR." };
    case "order_reschedule_resolved":
      return { title: "Date request settled", body: "Operations agreed the next step with you and the shop. The job carries on." };
    default:
      return null;
  }
}

const NEEDS_YOU_TYPES = new Set([
  "order_reschedule_requested",
  "order_reschedule_declined",
  "order_reschedule_rematch_refreshed",
]);

export function rescheduleNotificationNeedsYou(type: string | null | undefined): boolean {
  return type != null && NEEDS_YOU_TYPES.has(type);
}
