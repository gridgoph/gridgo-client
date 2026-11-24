import type { Order } from "@/lib/api";

/** An A3 Express order the shop just accepted: payment is owed before `payBy`. */
export function acceptedA3Order(overrides: Partial<Order["expressOrder"] & object> = {}, state = "awaiting_initial_payment"): Order {
  return {
    id: "order_a3",
    state,
    fulfillmentMode: "pickup",
    orderType: "express",
    downpaymentPercent: 100,
    balanceMinor: 0,
    payments: {
      initial: { amountMinor: 24_000, method: "qr_manual", status: "not_submitted", reference: null, submittedAt: null, confirmedAt: null },
    },
    expressOrder: {
      status: "accepted",
      originalSupplierId: "shop_1",
      currentSupplierId: "shop_1",
      declineCount: 0,
      acceptBy: null,
      events: [],
      refundRequired: false,
      paymentTiming: "after_acceptance",
      payBy: new Date(Date.now() + 4 * 60_000 + 30_000).toISOString(),
      repickRequired: false,
      printSettings: [],
      ...overrides,
    },
  } as unknown as Order;
}
