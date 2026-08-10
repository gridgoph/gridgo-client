/**
 * Client-facing order state vocabulary.
 *
 * Pure helpers so list chips, detail timelines, and tests share one map of
 * label + tone + icon. Colour never carries meaning alone.
 *
 * Tone/icon strings match `StatusChip` props without importing UI from lib.
 */

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
  needs_qa: { label: "In QA", tone: "info", icon: "clock" },
  client_correction: { label: "Needs correction", tone: "warning", icon: "triangle-alert" },
  proof_approval: { label: "Proof approval", tone: "warning", icon: "square-pen" },
  approved_for_matching: { label: "Approved", tone: "success", icon: "circle-check" },
  supplier_assigned: { label: "Supplier assigned", tone: "info", icon: "clock" },
  supplier_accepted: { label: "Supplier accepted", tone: "info", icon: "circle-check" },
  supplier_proof_review: { label: "Proof approval", tone: "warning", icon: "square-pen" },
  supplier_proof_changes_requested: {
    label: "Changes requested",
    tone: "warning",
    icon: "triangle-alert",
  },
  supplier_proof_approved: { label: "Proof approved", tone: "success", icon: "circle-check" },
  awaiting_payment: { label: "Awaiting payment", tone: "warning", icon: "triangle-alert" },
  payment_authorized: { label: "Payment authorized", tone: "success", icon: "circle-check" },
  production: { label: "In production", tone: "info", icon: "clock" },
  supplier_self_qc: { label: "Supplier QC", tone: "info", icon: "clock" },
  ready_for_dispatch: { label: "Ready for dispatch", tone: "info", icon: "clock" },
  rider_assigned: { label: "Rider assigned", tone: "info", icon: "clock" },
  picked_up: { label: "Picked up", tone: "info", icon: "clock" },
  out_for_delivery: { label: "Out for delivery", tone: "info", icon: "clock" },
  delivered: { label: "Delivered", tone: "success", icon: "circle-check" },
  issue_window_open: { label: "Issue window open", tone: "warning", icon: "triangle-alert" },
  completed: { label: "Completed", tone: "success", icon: "circle-check" },
  payout_released: { label: "Completed", tone: "success", icon: "circle-check" },
};

const FALLBACK: OrderStateMeta = {
  label: "In progress",
  tone: "neutral",
  icon: "clock",
};

export function getOrderStateMeta(state: string): OrderStateMeta {
  // Never surface snake_case API states. Unknown → neutral "In progress".
  return STATE_META[state] ?? FALLBACK;
}

/** States where the client watches delivery (never controls it). */
export const TRACKING_STATES = ["rider_assigned", "picked_up", "out_for_delivery"] as const;

export function isTrackingState(state: string): boolean {
  return (TRACKING_STATES as readonly string[]).includes(state);
}

export function isProofApprovalState(state: string): boolean {
  return state === "proof_approval";
}

/**
 * Supplier print proof awaiting the client's decision.
 *
 * Separate from `proof_approval`, which is the artwork proof Operations
 * prepares before matching. Both ask the client to approve; they sit at
 * different points in the job.
 */
export function isSupplierProofReviewState(state: string): boolean {
  return state === "supplier_proof_review";
}

export function isSupplierProofChangesRequestedState(state: string): boolean {
  return state === "supplier_proof_changes_requested";
}

/** Any state where the client owes a proof decision. */
export function isAnyProofDecisionState(state: string): boolean {
  return isProofApprovalState(state) || isSupplierProofReviewState(state);
}

export function isClientCorrectionState(state: string): boolean {
  return state === "client_correction";
}

export function isAwaitingPaymentState(state: string): boolean {
  return state === "awaiting_payment";
}

export function isIssueWindowState(state: string): boolean {
  return state === "issue_window_open";
}

/**
 * The one thing the client should do next, or null when the job is with
 * someone else. Drives the single yellow action on the order screen, so a
 * screen never carries two competing calls to act.
 */
export type OrderNextAction = {
  /** Sentence-case verb phrase for the action itself. */
  title: string;
  /** Why it is being asked of them now. */
  body: string;
};

const NEXT_ACTIONS: Record<string, OrderNextAction> = {
  client_correction: {
    title: "Replace the artwork",
    body: "Operations found something they cannot print from. Upload a corrected file and send this job back to them — the order, its quote and any payment stay as they are.",
  },
  proof_approval: {
    title: "Approve your artwork proof",
    body: "Operations has checked your file against the print specification. Approving sends this job out for supplier matching.",
  },
  supplier_proof_review: {
    title: "Approve the print proof",
    body: "Your supplier has sent the proof they intend to print. Approving commits you to this print run.",
  },
  awaiting_payment: {
    title: "Choose how to pay",
    body: "Your supplier has priced the job. Production starts once payment is authorized.",
  },
  issue_window_open: {
    title: "Check your delivery",
    body: "Tell Operations within 24 hours if anything is wrong with what arrived.",
  },
};

export function orderNextAction(state: string): OrderNextAction | null {
  return NEXT_ACTIONS[state] ?? null;
}

/**
 * What the client is waiting on when there is nothing for them to do.
 * An order screen must never read as an empty shrug.
 */
const WAITING_ON: Record<string, string> = {
  draft: "This request has not been sent yet.",
  submitted: "Operations is picking this up for artwork QA.",
  needs_qa: "Operations is checking your artwork against the print specification.",
  approved_for_matching: "Operations is matching this job to a supplier who can print it.",
  supplier_assigned: "The supplier is reviewing the job before they accept it.",
  supplier_accepted: "Your supplier is preparing a print proof for you to approve.",
  supplier_proof_changes_requested: "Your supplier is reworking the proof you sent back.",
  supplier_proof_approved: "Your supplier is finalising the quote for this run.",
  payment_authorized: "Payment is authorized. Your supplier starts production next.",
  production: "Your job is on the press.",
  supplier_self_qc: "Your supplier is checking the finished job before it ships.",
  ready_for_dispatch: "The job is packed and waiting for a rider.",
  rider_assigned: "A rider has taken this delivery.",
  picked_up: "The rider has collected your order.",
  out_for_delivery: "Your order is out for delivery.",
  completed: "This job is closed.",
  payout_released: "This job is closed.",
};

export function orderWaitingOn(state: string): string | null {
  return WAITING_ON[state] ?? null;
}

/**
 * The most recent note left when the order entered a given state.
 *
 * This is how a rejection reason reaches the client: Operations writes it on
 * the transition, so the correction screen can show why rather than just that.
 */
export function latestNoteForState(
  timeline: { at: string; state: string; note: string }[],
  state: string,
): string | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (entry.state === state && entry.note?.trim()) return entry.note.trim();
  }
  return null;
}

/** Order grand total in PHP minor units (product + delivery). */
export function orderGrandTotalMinor(order: {
  totalMinor: number;
  deliveryFeeMinor: number;
}): number {
  return order.totalMinor + order.deliveryFeeMinor;
}
