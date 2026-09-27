import type { Invoice, MatchedOrder } from "@/lib/api";
import {
  holdPlacedReceipt,
  paymentStatusOf,
  placedReceiptFor,
  receiptDateLabel,
  receiptFromCheckout,
  receiptFromInvoice,
  receiptPaymentLine,
  receiptQuantityLabel,
} from "@/lib/receipt";

/** A paid-in-full order, the way `POST /me/carts/:id/checkout` answers. */
const invoice: Invoice = {
  invoiceNumber: "GG-20260927-0007",
  orderId: "ord_3ff0128e105a",
  issuedAt: "2026-09-27T01:05:00.000Z",
  currency: "PHP",
  lines: [
    {
      id: "line_1",
      jobId: "job_1",
      itemName: "Flyers",
      quantity: 100,
      unitPriceMinor: 4000,
      amountMinor: 40000,
      artworkFileId: "file_1",
      mockupFileId: null,
      dropoff: null,
    },
    {
      id: "line_2",
      jobId: "job_2",
      itemName: "Tarpaulin 3x6",
      quantity: 2,
      unitPriceMinor: 30000,
      amountMinor: 60000,
      artworkFileId: "file_2",
      mockupFileId: null,
      dropoff: null,
    },
  ],
  itemSubtotalMinor: 100000,
  serviceFeeRateBps: 1000,
  serviceFeeMinor: 10000,
  deliveryLines: [],
  deliveryFeeMinor: 12000,
  totalMinor: 122000,
  paymentPlan: { method: "qr_manual", downpaymentMinor: 122000, balanceMinor: 0 },
};

const placed = {
  id: "ord_3ff0128e105a",
  paymentPlan: {
    method: "qr_manual",
    downpaymentMinor: 122000,
    balanceMinor: 0,
    downpaymentStatus: "pending_confirmation",
    downpaymentPercent: 100,
  },
} satisfies Pick<MatchedOrder, "id" | "paymentPlan">;

describe("receiptFromCheckout", () => {
  it("prints the order's own lines, fee-inclusive prices, delivery and total", () => {
    const view = receiptFromCheckout(invoice, placed, " 1234567890123 ");

    expect(view).not.toBeNull();
    expect(view?.orderReference).toBe("3FF0-128E-105A");
    expect(view?.invoiceNumber).toBe("GG-20260927-0007");
    expect(view?.issuedAt).toBe("2026-09-27T01:05:00.000Z");
    expect(view?.lines.map((line) => [line.name, line.quantity, line.amountLabel])).toEqual([
      ["Flyers", 100, "₱440.00"],
      ["Tarpaulin 3x6", 2, "₱660.00"],
    ]);
    expect(view?.money).toEqual({
      printingMinor: 110000,
      deliveryFeeMinor: 12000,
      serviceFeeMinor: 10000,
      serviceFeeRateBps: 1000,
      totalMinor: 122000,
    });
    // Printing + Delivery = Total: the fee is inside printing, never a third charge.
    expect(view!.money.printingMinor + view!.money.deliveryFeeMinor).toBe(view!.money.totalMinor);
    expect(view?.paymentReference).toBe("1234567890123");
    expect(view?.paidInFull).toBe(true);
    expect(view?.paymentStatus).toBe("checking");
  });

  it("reads a confirmed up-front payment as confirmed", () => {
    const view = receiptFromCheckout(
      invoice,
      { ...placed, paymentPlan: { ...placed.paymentPlan, downpaymentStatus: "confirmed" } },
      "1234567890123",
    );
    expect(view?.paymentStatus).toBe("confirmed");
  });

  it("keeps a legacy 75/25 order off the paid-in-full wording", () => {
    const view = receiptFromCheckout(
      { ...invoice, paymentPlan: { method: "qr_manual", downpaymentMinor: 91500, balanceMinor: 30500 } },
      {
        ...placed,
        paymentPlan: {
          method: "qr_manual",
          downpaymentMinor: 91500,
          balanceMinor: 30500,
          downpaymentStatus: "pending_confirmation",
          downpaymentPercent: 75,
        },
      },
      "1234567890123",
    );
    expect(view?.paidInFull).toBe(false);
  });

  it("is null when the checkout answer is not a whole invoice", () => {
    expect(receiptFromCheckout({ id: "inv_1" } as unknown as Invoice, placed, "1234")).toBeNull();
    expect(receiptFromCheckout(null, placed, "1234")).toBeNull();
    expect(receiptFromCheckout(invoice, null, "1234")).toBeNull();
  });
});

describe("placed receipt handoff", () => {
  it("hands the slip to the receipt screen for the same order only", () => {
    const view = receiptFromCheckout(invoice, placed, "1234567890123");
    holdPlacedReceipt(view);

    expect(placedReceiptFor("ord_3ff0128e105a")).toBe(view);
    // Read twice: a StrictMode double mount must see it both times.
    expect(placedReceiptFor("ord_3ff0128e105a")).toBe(view);
    expect(placedReceiptFor("ord_other")).toBeNull();
    expect(placedReceiptFor(undefined)).toBeNull();

    holdPlacedReceipt(null);
    expect(placedReceiptFor("ord_3ff0128e105a")).toBeNull();
  });
});

describe("receiptPaymentLine", () => {
  it("never says paid before Operations confirms the reference", () => {
    expect(receiptPaymentLine({ paidInFull: true, paymentStatus: "checking" })).toBe(
      "Sent in full by QR. GRIDGO is checking it.",
    );
    expect(receiptPaymentLine({ paidInFull: false, paymentStatus: "checking" })).toBe(
      "Downpayment sent by QR. GRIDGO is checking it.",
    );
    expect(receiptPaymentLine({ paidInFull: true, paymentStatus: "checking" })).not.toMatch(/paid/i);
  });

  it("says paid once it is confirmed, and nothing with no payment", () => {
    expect(receiptPaymentLine({ paidInFull: true, paymentStatus: "confirmed" })).toBe("Paid in full by QR");
    expect(receiptPaymentLine({ paidInFull: false, paymentStatus: "confirmed" })).toBe(
      "Downpayment paid by QR",
    );
    expect(receiptPaymentLine({ paidInFull: true, paymentStatus: "none" })).toBeNull();
  });
});

describe("paymentStatusOf", () => {
  const installment = (status: string, reference: string | null) => ({
    amountMinor: 1,
    method: "qr_manual",
    status,
    reference,
    submittedAt: null,
    confirmedAt: null,
  });

  it("reads the initial payment, under either key", () => {
    expect(paymentStatusOf({ initial: installment("pending_confirmation", "REF1") })).toBe("checking");
    expect(paymentStatusOf({ downpayment: installment("confirmed", "REF1") })).toBe("confirmed");
    expect(paymentStatusOf({ initial: installment("legacy_confirmed", null) })).toBe("confirmed");
    expect(paymentStatusOf({ initial: installment("due", null) })).toBe("none");
    expect(paymentStatusOf(undefined)).toBe("none");
  });
});

describe("receiptFromInvoice", () => {
  it("reads paid in full from the invoice's zero balance", () => {
    expect(receiptFromInvoice(invoice).paidInFull).toBe(true);
    expect(receiptFromInvoice(invoice).paymentStatus).toBe("none");
  });
});

describe("slip labels", () => {
  it("dates the slip in Davao time whatever zone the phone is in", () => {
    // 01:05 UTC is 9:05 AM in Davao.
    expect(receiptDateLabel("2026-09-27T01:05:00.000Z")).toMatch(/Sep.*27.*2026.*9:05/);
    expect(receiptDateLabel(null)).toBeNull();
    expect(receiptDateLabel("not a date")).toBeNull();
  });

  it("counts a line's quantity", () => {
    expect(receiptQuantityLabel(100)).toBe("Qty 100");
    expect(receiptQuantityLabel(1500)).toBe("Qty 1,500");
  });
});
