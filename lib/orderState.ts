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

export function isClientCorrectionState(state: string): boolean {
  return state === "client_correction";
}

export function isAwaitingPaymentState(state: string): boolean {
  return state === "awaiting_payment";
}

export function isIssueWindowState(state: string): boolean {
  return state === "issue_window_open";
}

/** Order grand total in PHP minor units (product + delivery). */
export function orderGrandTotalMinor(order: {
  totalMinor: number;
  deliveryFeeMinor: number;
}): number {
  return order.totalMinor + order.deliveryFeeMinor;
}
