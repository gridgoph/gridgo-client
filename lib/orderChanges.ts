/**
 * Special instructions on an item, and the shop's formal change request when
 * a note (or anything else) costs more or takes longer.
 *
 * Contract: gridgo-api `docs/ORDER_CHANGES_API.md` (report F9FCD485,
 * gridgo-client#244). The server owns every rule — masking, the 300-character
 * limit, the fee on a change, the window — and this module decides only what
 * the client reads and the one thing offered. Three things are easy to say
 * wrongly:
 *
 * - **A note never changes the price.** Anything that costs more comes back
 *   as a change request the client answers.
 * - **Approving is not paying.** A priced change is approved, then paid by QR,
 *   and the changed work starts only once Operations confirms the transfer.
 *   Until then the shop prints the order as it was placed.
 * - **Declining keeps the order as placed.** Nothing about the original job,
 *   its money or its date moves.
 *
 * The amount a client reads is the request's own `totalMinor`, GRIDGO's fee
 * already inside it. The shop's extra and the fee are never shown apart.
 */

import type { Order, OrderChangeRequest, ProductionItem } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import type { OrderNextAction } from "@/lib/orderState";
import { readyByDate } from "@/lib/readyTime";

/** The server counts Unicode characters, not UTF-16 units. */
export const SPECIAL_INSTRUCTIONS_MAX = 300;

export const NOTE_PRICE_HINT = "Notes cannot change the price.";

/** Said under the box, so a client knows who reads it and what it can do. */
export const NOTE_HELP =
  "The GRIDGO Team reads it before your job goes to a shop, and the shop must tick that it read it. If it costs more, the shop asks you first. Phone numbers, emails, links and social handles are hidden.";

export function specialInstructionsLength(text: string): number {
  return [...text.trim()].length;
}

/** Why this note cannot be saved, or null. Never truncated silently. */
export function specialInstructionsProblem(text: string): string | null {
  const over = specialInstructionsLength(text) - SPECIAL_INSTRUCTIONS_MAX;
  if (over <= 0) return null;
  return `Keep special instructions to ${SPECIAL_INSTRUCTIONS_MAX} characters. Remove ${over} to save.`;
}

/** "42 / 300" under the box. */
export function specialInstructionsCount(text: string): string {
  return `${specialInstructionsLength(text)} / ${SPECIAL_INSTRUCTIONS_MAX}`;
}

const OPEN = ["pending", "pending_payment", "pending_confirmation"];

export type ChangeRequestView =
  /** The shop asked; the client approves or declines. */
  | { kind: "answer"; change: OrderChangeRequest; itemName: string | null }
  /** Approved and priced: the QR top-up is due. Declining is still possible. */
  | { kind: "pay"; change: OrderChangeRequest; itemName: string | null }
  /** The top-up is with Operations. Nothing to do. */
  | { kind: "checking"; change: OrderChangeRequest; itemName: string | null };

/** The one request still open on this order (the server allows one at a time). */
export function openChangeRequest(order: Pick<Order, "changeRequests">): OrderChangeRequest | null {
  const open = (order.changeRequests ?? []).filter((row) => OPEN.includes(row.status));
  return open.at(-1) ?? null;
}

export function changeItemName(
  order: Pick<Order, "productionItems">,
  lineItemId: string | null | undefined,
): string | null {
  if (!lineItemId) return null;
  return order.productionItems?.find((item) => item.id === lineItemId)?.itemName ?? null;
}

/** Which face the open change shows, or null when nothing is open. */
export function changeRequestView(order: Pick<Order, "changeRequests" | "productionItems">): ChangeRequestView | null {
  const change = openChangeRequest(order);
  if (!change) return null;
  const itemName = changeItemName(order, change.lineItemId);
  if (change.status === "pending") return { kind: "answer", change, itemName };
  if (change.status === "pending_payment") return { kind: "pay", change, itemName };
  return { kind: "checking", change, itemName };
}

/** True while a change asks something of the client: Home's docket and the order's yellow. */
export function changeNeedsClient(order: Pick<Order, "changeRequests" | "productionItems">): boolean {
  const view = changeRequestView(order);
  return view?.kind === "answer" || view?.kind === "pay";
}

/** What the change costs, in one line. */
export function changePriceLine(change: Pick<OrderChangeRequest, "totalMinor">): string {
  return change.totalMinor > 0 ? `${formatPhp(change.totalMinor)} more` : "No extra cost";
}

/** What the request would change, named plainly: the spec, the date, or both. */
export function changeKindLabel(change: Pick<OrderChangeRequest, "proposedSpec" | "proposedPromiseBy" | "colourCorrection">): string {
  const spec = Boolean(change.proposedSpec?.trim());
  const time = Boolean(change.proposedPromiseBy);
  // A shop that measured a page differently from GRIDGO's estimate asks
  // before it prints at another price (gridgo-api docs/COLOUR_PRICING_API.md).
  if (change.colourCorrection) return time ? "A corrected colour price and a new ready date" : "A corrected colour price";
  if (spec && time) return "A change to the item and its ready date";
  if (time) return "A new ready date";
  return "A change to the item";
}

/** What approving does, written under the button before the client taps it. */
export function approveNote(change: OrderChangeRequest): string {
  const date = readyByDate(change.proposedPromiseBy);
  const dated = date ? ` Your order will be ready by ${date}.` : "";
  if (change.totalMinor > 0) {
    return `Next you pay ${formatPhp(change.totalMinor)} by QR. The shop starts the change only once Operations confirms the payment.${dated}`;
  }
  return `The change is made straight away, at no extra cost.${dated}`;
}

export const DECLINE_NOTE = "The shop prints your order exactly as you placed it. Nothing is charged.";

export const DECLINE_CONFIRM = {
  question: "Decline this change?",
  body: "The shop carries on with your order as you placed it, with the same price and ready date.",
  confirm: "Decline the change",
  cancel: "Go back",
};

/** Home's docket verb, keyed to the action (see `OrderNextAction`). */
export function changeNextAction(order: Pick<Order, "changeRequests" | "productionItems">): OrderNextAction | null {
  const view = changeRequestView(order);
  if (view?.kind === "answer") {
    return {
      title: "Answer the shop's change request",
      body:
        view.change.totalMinor > 0
          ? `The shop asks to change ${view.itemName ?? "your order"} for ${formatPhp(view.change.totalMinor)} more. Approve or decline it.`
          : `The shop asks to change ${view.itemName ?? "your order"}. Approve or decline it.`,
      tone: "warning",
      icon: "square-pen",
    };
  }
  if (view?.kind === "pay") {
    return {
      title: `Pay ${formatPhp(view.change.totalMinor)} for your change`,
      body: "You approved the shop's change. It starts once Operations confirms your QR payment; until then the shop prints your order as placed.",
      tone: "warning",
      icon: "wallet",
    };
  }
  return null;
}

/** The one-line wait while the top-up is with Operations. */
export function changeWaitingOn(order: Pick<Order, "changeRequests" | "productionItems">): string | null {
  return changeRequestView(order)?.kind === "checking"
    ? "We are checking your payment for the change. The shop keeps printing your order as placed until Operations confirms it."
    : null;
}

/** Settled requests, newest first: the record under Specifications. */
export function settledChanges(order: Pick<Order, "changeRequests">): OrderChangeRequest[] {
  return (order.changeRequests ?? []).filter((row) => !OPEN.includes(row.status)).slice().reverse();
}

/** A settled request's outcome, in words. Unknown statuses read as closed, never as approved. */
export function settledChangeLabel(change: Pick<OrderChangeRequest, "status" | "totalMinor">): string {
  if (change.status === "applied") {
    return change.totalMinor > 0 ? `Approved · ${formatPhp(change.totalMinor)} paid by QR` : "Approved";
  }
  if (change.status === "declined") return "Declined · order kept as placed";
  return "Closed · order kept as placed";
}

/** Approved changes that cost something, for the money card. */
export function paidChanges(order: Pick<Order, "changeRequests">): OrderChangeRequest[] {
  return (order.changeRequests ?? []).filter((row) => row.status === "applied" && row.totalMinor > 0);
}

/** The note on an item and what the shop agreed to since. */
export function itemNote(item: Pick<ProductionItem, "specialInstructions" | "agreedChange">): {
  note: string | null;
  agreed: string | null;
} {
  return {
    note: item.specialInstructions?.trim() || null,
    agreed: item.agreedChange?.proposedSpec?.trim() || null,
  };
}

/** Whether the shop has ticked that it read the notes. */
export function notesAcknowledged(order: Pick<Order, "specialInstructionsAcknowledgement">): boolean {
  return Boolean(order.specialInstructionsAcknowledgement?.at);
}

/**
 * `order_change_*` inbox rows, in the client's words. gridgo-api writes one
 * generic body for the client, the shop and Operations, so the client copy
 * always comes from here.
 */
export function changeNotificationCopy(type: string | null | undefined): { title: string; body: string } | null {
  switch (type) {
    case "order_change_requested":
      return { title: "The shop asks to change your order", body: "Open the order to see what would change, why, and any extra cost. Approve or decline it." };
    case "order_change_accepted":
      return { title: "Pay for the change you approved", body: "The change starts once Operations confirms your QR payment. Until then the shop prints your order as placed." };
    case "order_change_payment_submitted":
      return { title: "Checking your payment for the change", body: "Operations is matching your transfer. The shop keeps printing your order as placed until they confirm it." };
    case "order_change_payment_rejected":
      return { title: "Change payment not confirmed", body: "Operations could not match your transfer. Open the order for their reason and send it again." };
    case "order_change_applied":
      return { title: "Change agreed", body: "The shop now prints your order with the change you approved." };
    case "order_change_declined":
      return { title: "Change declined", body: "The shop prints your order as you placed it." };
    case "order_change_closed":
      return { title: "Change request closed", body: "It was not settled before printing finished, so your order stays as you placed it. Nothing was charged for it." };
    default:
      return null;
  }
}

/** Rows that ask something while the change is still open. */
export const CHANGE_ASK_TYPES = [
  "order_change_requested",
  "order_change_accepted",
  "order_change_payment_rejected",
] as const;

export function isChangeAsk(type: string | null | undefined): boolean {
  return (CHANGE_ASK_TYPES as readonly string[]).includes(type ?? "");
}

/** The states in which a change can still be answered or paid (the server's window). */
export const CHANGE_WINDOW_STATES = [
  "supplier_assigned",
  "supplier_accepted",
  "payment_authorized",
  "production",
  "supplier_self_qc",
];
