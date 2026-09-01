/**
 * Client-facing order state vocabulary.
 *
 * Pure helpers so list chips, detail timelines, and tests share one map of
 * label + tone + icon. Colour never carries meaning alone.
 *
 * The states are the ones in `docs/OPERATIONAL_MODEL_V2_API.md`. The supplier
 * proof loop was removed from the platform, so `supplier_proof_*` is gone; the
 * single `awaiting_payment` step is now the two halves of the digital payment.
 *
 * Tone/icon strings match `StatusChip` props without importing UI from lib.
 */

import type { Order } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { balanceDue, downpaymentDue, installmentUnderReview } from "@/lib/payment";

export type OrderStatusTone = "success" | "warning" | "error" | "info" | "neutral";
export type OrderStatusIcon =
  | "circle-check"
  | "triangle-alert"
  | "circle-x"
  | "clock"
  | "square-pen";

export type OrderStateMeta = {
  label: string;
  tone: OrderStatusTone;
  icon: OrderStatusIcon;
};

/** Human labels for every pilot state the client may see. */
const STATE_META: Record<string, OrderStateMeta> = {
  draft: { label: "Draft", tone: "neutral", icon: "square-pen" },
  submitted: { label: "Submitted", tone: "info", icon: "clock" },
  needs_qa: { label: "In artwork check", tone: "info", icon: "clock" },
  client_correction: { label: "Needs correction", tone: "warning", icon: "triangle-alert" },
  proof_approval: { label: "Proof approval", tone: "warning", icon: "square-pen" },
  approved_for_matching: { label: "Finding a supplier", tone: "info", icon: "clock" },
  supplier_assigned: { label: "Supplier reviewing", tone: "info", icon: "clock" },
  awaiting_downpayment: { label: "Downpayment due", tone: "warning", icon: "triangle-alert" },
  downpayment_review: { label: "Checking your payment", tone: "info", icon: "clock" },
  payment_authorized: { label: "Downpayment confirmed", tone: "success", icon: "circle-check" },
  production: { label: "In production", tone: "info", icon: "clock" },
  supplier_self_qc: { label: "Supplier quality check", tone: "info", icon: "clock" },
  ready_for_dispatch: { label: "Ready for dispatch", tone: "info", icon: "clock" },
  rider_assigned: { label: "Rider assigned", tone: "info", icon: "clock" },
  picked_up: { label: "Picked up", tone: "info", icon: "clock" },
  out_for_delivery: { label: "Out for delivery", tone: "info", icon: "clock" },
  awaiting_collection: { label: "Ready for pickup", tone: "success", icon: "circle-check" },
  delivered: { label: "Delivered", tone: "success", icon: "circle-check" },
  issue_window_open: { label: "Check your delivery", tone: "warning", icon: "triangle-alert" },
  completed: { label: "Completed", tone: "success", icon: "circle-check" },
  payout_released: { label: "Completed", tone: "success", icon: "circle-check" },
};

/**
 * A collecting client is not being delivered to.
 *
 * A rider does carry the job, but only from the shop to the GRIDGO Office
 * counter — two of GRIDGO's own places. Telling the client it is "out for
 * delivery" describes an errand of ours as their delivery, and sends them
 * looking out of a window instead of to the counter. Only the states where
 * something travels differ; everything before that is the same job.
 */
const COLLECT_META: Record<string, OrderStateMeta> = {
  rider_assigned: { label: "Being collected from the shop", tone: "info", icon: "clock" },
  picked_up: { label: "On the way to GRIDGO Office", tone: "info", icon: "clock" },
  out_for_delivery: { label: "On the way to GRIDGO Office", tone: "info", icon: "clock" },
  delivered: { label: "Collected", tone: "success", icon: "circle-check" },
  issue_window_open: { label: "Check your order", tone: "warning", icon: "triangle-alert" },
};

/** True when the client fetches this order from the GRIDGO Office counter. */
export function collectsAtOffice(order: Pick<Order, "fulfillmentMode">): boolean {
  return order.fulfillmentMode === "pickup";
}

const FALLBACK: OrderStateMeta = {
  label: "In progress",
  tone: "neutral",
  icon: "clock",
};

export function getOrderStateMeta(state: string, fulfillmentMode?: string | null): OrderStateMeta {
  // Never surface snake_case API states. Unknown → neutral "In progress".
  if (fulfillmentMode === "pickup" && COLLECT_META[state]) return COLLECT_META[state];
  return STATE_META[state] ?? FALLBACK;
}

/** States where the client watches delivery (never controls it). */
export const TRACKING_STATES = ["rider_assigned", "picked_up", "out_for_delivery"] as const;

export function isTrackingState(state: string): boolean {
  return (TRACKING_STATES as readonly string[]).includes(state);
}

/** True while the job is waiting on the GRIDGO Office counter to be claimed. */
export function isAwaitingCollectionState(state: string): boolean {
  return state === "awaiting_collection";
}

/**
 * The one proof decision the client still owns: Operations' artwork proof,
 * before the job goes out for matching. The supplier print proof loop was
 * removed from the platform — what replaced it is milestone visibility.
 */
export function isProofApprovalState(state: string): boolean {
  return state === "proof_approval";
}

export function isClientCorrectionState(state: string): boolean {
  return state === "client_correction";
}

export function isIssueWindowState(state: string): boolean {
  return state === "issue_window_open";
}

/** From here on the job is being made, so its milestones mean something. */
const PRODUCTION_ONWARD = [
  "payment_authorized",
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "awaiting_collection",
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
];

export function showsFulfilmentProgress(state: string): boolean {
  return PRODUCTION_ONWARD.includes(state);
}

/**
 * The one thing the client should do next, or null when the job is with
 * someone else. Drives the single yellow action on the order screen, so a
 * screen never carries two competing calls to act.
 *
 * It reads the payment record as well as the state, because both halves of the
 * payment are asked for from states that otherwise belong to someone else.
 */
export type OrderNextAction = {
  /** Sentence-case verb phrase for the action itself. */
  title: string;
  /** Why it is being asked of them now. */
  body: string;
};

const STATE_ACTIONS: Record<string, OrderNextAction> = {
  client_correction: {
    title: "Replace the artwork",
    body: "Operations found something they cannot print from. Upload a corrected file and send this job back to them — the order, its quote and any payment stay as they are.",
  },
  proof_approval: {
    title: "Approve your artwork proof",
    body: "Operations has checked your file against the print specification. Approving sends this job out for supplier matching.",
  },
  issue_window_open: {
    title: "Check your delivery",
    body: "Tell Operations while the issue window is open if anything is wrong with what arrived.",
  },
};

/** The same two moments, for a client who is coming to fetch the job. */
const COLLECT_STATE_ACTIONS: Record<string, OrderNextAction> = {
  awaiting_collection: {
    title: "Collect at GRIDGO Office",
    body: "Your order is on the counter, paid for and ready. Bring the name you ordered under.",
  },
  issue_window_open: {
    title: "Check your order",
    body: "Tell Operations while the issue window is open if anything is wrong with what you collected.",
  },
};

export function orderNextAction(order: Order): OrderNextAction | null {
  if (downpaymentDue(order)) {
    const amount = order.payments?.downpayment.amountMinor;
    return {
      title: "Pay the 75% downpayment",
      body: amount
        ? `Your supplier accepted at ${formatPhp(order.totalMinor ?? 0)} in total. Pay ${formatPhp(amount)} now by QR; production starts once Operations confirms it.`
        : "Your supplier has accepted and priced the job. Pay the downpayment by QR to start production.",
    };
  }
  if (balanceDue(order)) {
    const amount = order.payments?.balance.amountMinor;
    if (collectsAtOffice(order)) {
      return {
        title: "Pay the remaining 25%",
        body: amount
          ? `Settle the last ${formatPhp(amount)} before you come for this. The GRIDGO Office counter releases it once Operations confirms your payment.`
          : "Settle the remaining balance before you come for this. The GRIDGO Office counter releases it once Operations confirms your payment.",
      };
    }
    return {
      title: "Pay the remaining 25%",
      body: amount
        ? `Your job is on the press. GRIDGO sends a rider once the last ${formatPhp(amount)} is confirmed.`
        : "Your job is on the press. GRIDGO sends a rider once the remaining balance is confirmed.",
    };
  }
  if (collectsAtOffice(order)) return COLLECT_STATE_ACTIONS[order.state] ?? STATE_ACTIONS[order.state] ?? null;
  return STATE_ACTIONS[order.state] ?? null;
}

/**
 * True when the job is waiting on the client rather than on GRIDGO.
 *
 * Home leads with these. A client who opens the app to find one job needing a
 * proof decision should not have to read past four jobs that are simply on the
 * press to find it.
 */
export function orderNeedsClient(order: Order): boolean {
  return orderNextAction(order) !== null;
}

/**
 * What the client is waiting on when there is nothing for them to do.
 * An order screen must never read as an empty shrug.
 */
const WAITING_ON: Record<string, string> = {
  draft: "This request has not been sent yet.",
  submitted: "Operations is picking this up for the artwork check.",
  needs_qa: "Operations is checking your artwork against the print specification.",
  approved_for_matching: "Operations is matching this job to a supplier who can print it.",
  supplier_assigned: "The supplier is reviewing the job before they accept it and set the price.",
  awaiting_downpayment: "Your supplier has accepted. The downpayment is next.",
  payment_authorized: "Your downpayment is confirmed. Your supplier starts production next.",
  production: "Your job is on the press.",
  supplier_self_qc: "Your supplier is checking the finished job before it ships.",
  ready_for_dispatch: "The job is packed and waiting for a rider.",
  rider_assigned: "A rider has taken this delivery.",
  picked_up: "The rider has collected your order.",
  out_for_delivery: "Your order is out for delivery.",
  delivered: "Delivered. Operations closes the job once the issue window passes.",
  awaiting_collection: "Your order is waiting at the GRIDGO Office counter.",
  completed: "This job is closed.",
  payout_released: "This job is closed.",
};

/** The travel half of the wait, for a job the client is coming to fetch. */
const COLLECT_WAITING_ON: Record<string, string> = {
  ready_for_dispatch: "The job is packed and waiting for a rider to bring it to the office.",
  rider_assigned: "A rider is collecting this from the shop.",
  picked_up: "The rider has your order and is bringing it to GRIDGO Office.",
  out_for_delivery: "Your order is on its way to GRIDGO Office.",
  delivered: "Collected. Operations closes the job once the issue window passes.",
};

export function orderWaitingOn(order: Order): string | null {
  const underReview = installmentUnderReview(order);
  if (underReview === "downpayment") {
    return "We are checking your downpayment. Operations matches the reference you sent against the GRIDGO wallet by hand, so this is not instant.";
  }
  if (underReview === "balance") {
    return "We are checking your balance payment. Your order goes out for delivery once Operations confirms it.";
  }
  if (collectsAtOffice(order) && COLLECT_WAITING_ON[order.state]) return COLLECT_WAITING_ON[order.state];
  return WAITING_ON[order.state] ?? null;
}

/**
 * The most recent note left when the order entered a given state.
 *
 * This is how a rejection reason reaches the client: Operations writes it on
 * the transition, so the correction screen can show why rather than just that.
 */
export function latestNoteForState(
  timeline: { at: string; state: string; note: string }[] | null | undefined,
  state: string,
): string | null {
  if (!Array.isArray(timeline) || timeline.length === 0) return null;
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (entry.state === state && entry.note?.trim()) return entry.note.trim();
  }
  return null;
}

/**
 * What the client owes in total, in PHP minor units, or null before a supplier
 * has accepted and the exact price exists. Subtotal + delivery — the server
 * has already added its margin into the subtotal, and never sends the split.
 */
export function orderTotalMinor(order: Order): number | null {
  if (order.totalMinor != null) return order.totalMinor;
  if (order.subtotalMinor == null) return null;
  return order.subtotalMinor + (order.deliveryFeeMinor ?? 0);
}

/**
 * The estimate, before a supplier has accepted. A range reads as one figure
 * when both ends agree — "₱1,485 – ₱1,485" is a range in name only.
 */
export function formatPriceRange(minMinor: number, maxMinor: number): string {
  if (minMinor === maxMinor) return formatPhp(minMinor);
  return `${formatPhp(minMinor)} – ${formatPhp(maxMinor)}`;
}
