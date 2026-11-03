import type { OrderChangeRequest, RescheduleRequest, ShopMovePricing, ShopRecovery } from "@/lib/api";

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

/**
 * The substitute-shop price rule (gridgo-api#225) against refundOrder's ₱1,000
 * shop price (₱1,100 printing to the client), with a ₱50 cover cap.
 */
export function shopMovePricing(rule: "cheaper" | "same" | "covered" | "above_cap" | "not_applicable"): ShopMovePricing {
  const base = { ruleApplies: true, rule, originalPriceMinor: 100000, gridgoCoverMinor: 0, clientPaysMinor: 0, refundMinor: 0 };
  switch (rule) {
    case "cheaper":
      return { ...base, newPriceMinor: 90000, differenceMinor: -10000, refundMinor: 10000 };
    case "same":
      return { ...base, newPriceMinor: 100000, differenceMinor: 0 };
    case "covered":
      return { ...base, newPriceMinor: 104000, differenceMinor: 4000, gridgoCoverMinor: 4000 };
    case "above_cap":
      return { ...base, newPriceMinor: 120000, differenceMinor: 20000, gridgoCoverMinor: 5000, clientPaysMinor: 15000 };
    case "not_applicable":
      return { ...base, ruleApplies: false, newPriceMinor: 100000, differenceMinor: 0 };
  }
}

/** A priced offer, as gridgo-api#225 projects it to the owning client. */
export function pricedRecovery(
  rule: Parameters<typeof shopMovePricing>[0],
  overrides: Partial<ShopRecovery> = {},
): ShopRecovery {
  const aboveCap = rule === "above_cap";
  return shopRecovery({
    fault: "shop",
    replacement: { optionId: "option_1", promiseBy: "2026-10-09T17:00:00+08:00", pricing: shopMovePricing(rule) },
    alternatives: [],
    canAccept: !aboveCap,
    canPickAlternative: false,
    canPayDifference: aboveCap,
    topUp: null,
    ...overrides,
  });
}

/** Above the cap, with one alternative that costs nothing extra and one that costs more. */
export function aboveCapWithAlternatives(): ShopRecovery {
  return pricedRecovery("above_cap", {
    canPickAlternative: true,
    alternatives: [
      { optionId: "option_2", promiseBy: "2026-10-10T17:00:00+08:00", pricing: shopMovePricing("covered") },
      {
        optionId: "option_3",
        promiseBy: "2026-10-12T17:00:00+08:00",
        pricing: { ...shopMovePricing("above_cap"), newPriceMinor: 110000, differenceMinor: 10000, clientPaysMinor: 5000 },
      },
    ],
  });
}

/** "Pay the rest" for a move: the change request the recovery owns. */
export function topUpChange(overrides: Partial<OrderChangeRequest> = {}): OrderChangeRequest {
  return {
    id: "change_topup_1",
    orderId: "ord_refund_1",
    lineItemId: null,
    status: "pending_payment",
    version: 1,
    totalMinor: 15000,
    createdAt: "2026-10-05T10:00:00+08:00",
    reason: "Replacement shop price above GRIDGO cover; the client chose to pay the rest.",
    proposedSpec: "",
    proposedPromiseBy: null,
    originalInstructions: "",
    payment: null,
    ...overrides,
  };
}

/** The recovery once the client chose to pay the rest. */
export function awaitingPaymentRecovery(overrides: Partial<ShopRecovery> = {}): ShopRecovery {
  return pricedRecovery("above_cap", {
    status: "awaiting_payment",
    canPayDifference: false,
    topUp: { changeRequestId: "change_topup_1", amountMinor: 15000 },
    ...overrides,
  });
}
