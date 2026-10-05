/**
 * Handing an order over, in a client's words (gridgo-api#124 and #125,
 * `docs/HUB_HANDOVER_API.md` in gridgo-api).
 *
 * Two moments share one credential. At the door, the client and the rider
 * see the same six-digit code and match it before the order changes hands.
 * At GRIDGO's pick-up hub the client shows a QR *and* that code; the staff
 * scan one and check the other. A mismatch never hands anything over: the
 * rider or the staff report it to Operations, and the client may too.
 *
 * Nothing here decides who may collect. The API mints, checks and consumes
 * the credential; this module only says when to ask for it and how to read
 * what comes back.
 */

import type { Order, OrderHandover } from "@/lib/api";
import { collectsAtOffice, isAwaitingCollectionState, isTrackingState } from "@/lib/orderState";

export type HandoverKind = "hub" | "delivery";

/**
 * Whether this order can have a handover credential right now, and which
 * kind. A delivery's code exists from the moment it is packed, but the client
 * only needs it while a rider is on the way; a hub code exists only once the
 * order is on the hub's shelf, never while the rider is still carrying it.
 */
export function handoverKind(order: Pick<Order, "fulfillmentMode" | "state">): HandoverKind | null {
  if (collectsAtOffice(order)) return isAwaitingCollectionState(order.state) ? "hub" : null;
  return isTrackingState(order.state) ? "delivery" : null;
}

/** A hub credential carries the QR token; a delivery one is the code alone. */
export function isHubHandover(handover: OrderHandover | null | undefined): handover is OrderHandover & { qrToken: string } {
  return typeof handover?.qrToken === "string" && handover.qrToken.length > 0;
}

/** "482913" → "482 913": two halves are easier to read aloud and to compare. */
export function formatHandoverCode(otp: string): string {
  return /^\d{6}$/.test(otp) ? `${otp.slice(0, 3)} ${otp.slice(3)}` : otp;
}

/** "4 8 2, 9 1 3" — a screen reader says digits, never "four hundred eighty-two". */
export function spokenHandoverCode(otp: string): string {
  return /^\d{6}$/.test(otp) ? `${otp.slice(0, 3).split("").join(" ")}, ${otp.slice(3).split("").join(" ")}` : otp;
}

export const HUB_SHOW_BOTH =
  "The staff scan the QR, then check that the code under it matches. Both are needed to collect.";

export const HUB_KEEP_PRIVATE =
  "Keep both private. Anyone who has them can collect this order.";

export const HUB_MISMATCH =
  "If the staff say the codes do not match, nothing is handed over. They report it to Operations, who contact you.";

export const HUB_BRIGHTNESS = "In bright sun, turn your screen brightness up so the QR scans.";

export const DELIVERY_MATCH =
  "Your rider has the same code on their phone. Ask them to read it out, and accept the order only if it matches.";

export const DELIVERY_MISMATCH = {
  title: "If the codes do not match",
  body: "Do not accept the order. The rider reports it to Operations, who contact you.",
} as const;

/** What a client-raised mismatch report says to Operations. */
export const DELIVERY_MISMATCH_REASON =
  "Client reports that the rider's handover code did not match the code in the client app.";

export type UnclaimedNotice = {
  tone: "info" | "warning";
  title: string;
  body: string;
};

/**
 * The hub's reminders, as a line on the order (the pushes say the same).
 *
 * Missed hub days are counted by the API from the hub's own calendar; the
 * client is told how many, what happens after the third, and — always — that
 * the order is not forfeited, because the app never forfeits anything.
 */
export function unclaimedNotice(
  handover: Pick<OrderHandover, "missedDays" | "operationsRequired" | "redeliveryRequest"> | null | undefined,
): UnclaimedNotice | null {
  if (!handover) return null;
  const missed = Math.max(0, Math.floor(handover.missedDays ?? 0));
  if (handover.redeliveryRequest) {
    return {
      tone: "info",
      title: "Redelivery requested",
      body: "Operations will contact you to arrange the delivery and its cost. Until then your order stays at the hub, and you can still collect it with the codes below.",
    };
  }
  if (handover.operationsRequired || missed >= 3) {
    return {
      tone: "warning",
      title: `${missed >= 3 ? `${missed} hub days` : "Hub days"} missed`,
      body: "Operations will contact you about this order. It is safe at the hub and is not forfeited. Collect it on the next open day, or ask for it to be redelivered at your own cost.",
    };
  }
  if (missed === 2) {
    return {
      tone: "warning",
      title: "2 hub days missed",
      body: "Please collect your order on the next open day. After a third missed day, Operations contacts you about it.",
    };
  }
  if (missed === 1) {
    return {
      tone: "info",
      title: "1 hub day missed",
      body: "Your order is still waiting at the hub. Come on the next open day with this QR and code.",
    };
  }
  return null;
}

/** Redelivery is the client's choice once Operations is following up, asked once. */
export function redeliveryOffered(
  handover: Pick<OrderHandover, "operationsRequired" | "redeliveryRequest"> | null | undefined,
): boolean {
  return Boolean(handover?.operationsRequired) && !handover?.redeliveryRequest;
}

export const REDELIVERY_CONFIRM = {
  question: "Ask for redelivery?",
  body: "A rider brings the order from the hub to you. The delivery is at your own cost: Operations contacts you with the price and a time before it goes out. Nothing you have already paid changes.",
  confirmLabel: "Ask for redelivery",
} as const;
