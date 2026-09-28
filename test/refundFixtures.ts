import type { Order, Refund } from "@/lib/api";

/**
 * The refund brief's worked example: ₱1,000 shop cost + ₱100 service fee +
 * ₱50 delivery = ₱1,150, paid in full and confirmed.
 */
export function refundOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord_refund_1",
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    state: "production",
    productId: "prod_flyers",
    title: "Grand opening flyers",
    quantity: 200,
    size: "A5",
    material: "matte",
    deadline: "2026-10-05T10:00:00+08:00",
    address: "12 J.P. Laurel Ave, Bajada, Davao City",
    zone: "davao_central",
    subtotalMinor: 100000,
    serviceFeeMinor: 10000,
    serviceFeeRateBps: 1000,
    deliveryFeeMinor: 5000,
    totalMinor: 115000,
    downpaymentMinor: 115000,
    balanceMinor: 0,
    downpaymentPercent: 100,
    fulfillmentMode: "delivery",
    payments: {
      initial: {
        amountMinor: 115000,
        method: "qr_manual",
        status: "confirmed",
        reference: "GCASH-123",
        submittedAt: "2026-09-26T09:00:00+08:00",
        confirmedAt: "2026-09-26T09:30:00+08:00",
      },
      final_online: {
        amountMinor: 0,
        method: "qr_manual",
        status: "not_required",
        reference: null,
        submittedAt: null,
        confirmedAt: null,
      },
    },
    paymentMethod: "qr_manual",
    paymentStatus: "confirmed",
    promisedDate: null,
    artworkName: "flyer.pdf",
    createdAt: "2026-09-26T08:00:00+08:00",
    updatedAt: "2026-09-27T08:00:00+08:00",
    timeline: [
      { at: "2026-09-26T08:00:00+08:00", state: "needs_qa", by: "user_client", note: "" },
      { at: "2026-09-27T08:00:00+08:00", state: "production", by: "user_supplier", note: "" },
    ],
    ...overrides,
  };
}

export function refund(overrides: Partial<Refund> = {}): Refund {
  return {
    id: "refund_1",
    orderId: "ord_refund_1",
    status: "requested",
    version: 1,
    policyVersion: "available_funds_v1",
    kind: "cancellation",
    reason: "We moved the event, so we no longer need the flyers.",
    evidenceFileIds: [],
    destination: {
      provider: "gcash",
      accountName: "Ana Santos",
      qrFileId: "file_client_qr",
      ownershipConfirmed: true,
      revision: 1,
    },
    beforeProduction: false,
    late: false,
    filingDeadlineAt: null,
    createdAt: "2026-09-28T10:00:00+08:00",
    updatedAt: "2026-09-28T10:00:00+08:00",
    history: [
      { kind: "requested", reason: "We moved the event, so we no longer need the flyers.", at: "2026-09-28T10:00:00+08:00" },
    ],
    settlement: null,
    payment: null,
    ...overrides,
  };
}

/** After ₱400 released and the shop waiving the rest: ₱600 + ₱60 + ₱50 = ₱710. */
export const PARTIAL_SETTLEMENT = {
  id: "rsettle_1",
  principalMinor: 60000,
  feeMinor: 6000,
  deliveryMinor: 5000,
  totalMinor: 71000,
  disposition: "cancelled",
  reason: "The shop keeps what it spent on printing so far and waives the rest.",
  approvedAt: "2026-09-28T12:00:00+08:00",
};

export function approvedRefund(overrides: Partial<Refund> = {}): Refund {
  return refund({
    status: "approved",
    version: 4,
    settlement: PARTIAL_SETTLEMENT,
    history: [
      { kind: "requested", reason: "We moved the event.", at: "2026-09-28T10:00:00+08:00" },
      { kind: "reviewed", reason: "Receiving account checked.", at: "2026-09-28T11:00:00+08:00" },
      { kind: "settled", reason: PARTIAL_SETTLEMENT.reason, at: "2026-09-28T12:00:00+08:00" },
    ],
    ...overrides,
  });
}
