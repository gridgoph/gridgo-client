import type { AcknowledgementReceipt } from "@/lib/api";

/**
 * An issued delivery acknowledgement receipt, shaped like gridgo-api's own
 * example (`docs/ACKNOWLEDGEMENT_RECEIPTS_API.md`): two lines, one without a
 * recorded unit rate, a one-centavo rounding adjustment and one QR payment.
 */
export function issuedReceipt(overrides: Partial<AcknowledgementReceipt> = {}): AcknowledgementReceipt {
  return {
    version: 1,
    orderId: "ord_refund_1",
    orderNumber: "ord_refund_1",
    arNumber: "AR-0000000001",
    issuedAt: "2026-10-21T01:00:00.000Z",
    issuedTo: "Maria Santos",
    currency: "PHP",
    lines: [
      { id: "line_1", description: "Flyers", quantity: 100, unitPriceMinor: 5506, subtotalMinor: 5506 },
      { id: "line_2", description: "Event poster", quantity: 1, unitPriceMinor: null, subtotalMinor: 5506 },
    ],
    deliveryFeeMinor: 5000,
    organizationDiscountMinor: 0,
    voucherDiscountMinor: 0,
    roundingAdjustmentMinor: -1,
    grandTotalMinor: 16011,
    payments: [
      {
        code: "initial",
        type: "digital",
        method: "qr_manual",
        reference: "QR-REF-2026",
        amountMinor: 16011,
        amountReceivedMinor: null,
        changeMinor: null,
      },
    ],
    note: "This temporary receipt acknowledges initial receipt pending final processing. It does not replace an Official Receipt or final invoice.",
    ...overrides,
  };
}
