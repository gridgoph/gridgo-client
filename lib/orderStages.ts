/**
 * The four stages a print job passes through, as a person tells the story.
 *
 * The legacy GRIDGO app put this rail on every notification, and it is the
 * reason a notification there was worth reading: it did not only say something
 * changed, it showed where the job had got to. This is that idea against the
 * v2 states.
 *
 * Deliberately coarse. The platform has twenty states; a client has four
 * questions — is it accepted, is it being made, is it moving, is it here. The
 * exact state still has its own label on the order screen, from
 * `lib/orderState.ts`, and this never replaces it.
 */

export type OrderStageKey = "order" | "printing" | "dispatch" | "delivered";

export type OrderStage = {
  key: OrderStageKey;
  label: string;
};

export const ORDER_STAGES: OrderStage[] = [
  { key: "order", label: "Order" },
  { key: "printing", label: "Printing" },
  { key: "dispatch", label: "Dispatch" },
  { key: "delivered", label: "Delivered" },
];

/**
 * Everything from the request being drafted to the downpayment clearing is
 * still "Order": nothing has been made yet, whoever the job is sitting with.
 */
const STAGE_BY_STATE: Record<string, OrderStageKey> = {
  draft: "order",
  submitted: "order",
  needs_qa: "order",
  client_correction: "order",
  proof_approval: "order",
  approved_for_matching: "order",
  supplier_assigned: "order",
  awaiting_downpayment: "order",
  downpayment_review: "order",
  payment_authorized: "order",

  production: "printing",
  supplier_self_qc: "printing",

  ready_for_dispatch: "dispatch",
  rider_assigned: "dispatch",
  picked_up: "dispatch",
  out_for_delivery: "dispatch",

  delivered: "delivered",
  issue_window_open: "delivered",
  completed: "delivered",
  payout_released: "delivered",
};

/**
 * How far along an order is, or null when the state is not one this app
 * knows. Null draws no rail — an invented position is worse than none.
 */
export function orderStageIndex(state: string | null | undefined): number | null {
  if (!state) return null;
  const key = STAGE_BY_STATE[state];
  if (!key) return null;
  return ORDER_STAGES.findIndex((stage) => stage.key === key);
}
