import type { RescheduleRequest, ShopRecovery } from "@/lib/api";

/** A client's view of a shop that could not take the order, with an offer. */
export function shopRecovery(overrides: Partial<ShopRecovery> = {}): ShopRecovery {
  return {
    id: "shop_event_1",
    status: "awaiting_client",
    createdAt: "2026-10-05T09:00:00+08:00",
    refundRequestId: null,
    replacement: { promiseBy: "2026-10-09T17:00:00+08:00" },
    canAccept: true,
    canRefund: true,
    ...overrides,
  };
}

/** A shop's pending request for three more days, asked at 9:00 on 5 October. */
export function rescheduleRequest(overrides: Partial<RescheduleRequest> = {}): RescheduleRequest {
  return {
    id: "resched_1",
    orderId: "ord_refund_1",
    reason: "The large-format printer needs a part replaced.",
    status: "pending",
    requestedAt: "2026-10-05T09:00:00+08:00",
    expiresAt: "2026-10-06T09:00:00+08:00",
    answeredAt: null,
    resolution: null,
    refundRequestId: null,
    workHeld: false,
    originalPromiseBy: "2026-10-07T17:00:00+08:00",
    proposedPromiseBy: "2026-10-10T17:00:00+08:00",
    canRequestRefund: false,
    rematch: null,
    ...overrides,
  };
}
