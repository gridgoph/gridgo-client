import { ApiError, type AcknowledgementReceipt } from "@/lib/api";
import {
  acknowledgementReceiptHref,
  downloadAcknowledgementReceipt,
  issuedStamp,
  lineDetail,
  paymentRows,
  paymentTypeLabel,
  readsAcknowledgementReceipt,
  receiptAbsence,
  receiptAdjustments,
  receiptReadError,
  receiptStage,
  receiptSummaryLine,
  RECEIPT_DOWNLOAD_NEEDS_REBUILD,
} from "@/lib/acknowledgementReceipt";
import { saveSignedInFile } from "@/lib/fileSave";

jest.mock("@/lib/fileSave", () => ({
  ...jest.requireActual("@/lib/fileSave"),
  saveSignedInFile: jest.fn(),
}));

const save = saveSignedInFile as jest.MockedFunction<typeof saveSignedInFile>;

const RECEIPT: AcknowledgementReceipt = {
  version: 1,
  orderId: "ord_1",
  orderNumber: "ord_1",
  arNumber: "AR-0000000007",
  issuedAt: "2026-10-21T01:00:00.000Z",
  issuedTo: "Client account name",
  currency: "PHP",
  lines: [
    { id: "line_1", description: "Flyers", quantity: 100, unitPriceMinor: 5506, subtotalMinor: 5506 },
    { id: "line_2", description: "Posters", quantity: 1, unitPriceMinor: null, subtotalMinor: 5506 },
  ],
  deliveryFeeMinor: 5000,
  organizationDiscountMinor: 0,
  voucherDiscountMinor: 0,
  roundingAdjustmentMinor: -1,
  grandTotalMinor: 16011,
  payments: [
    { code: "initial", type: "digital", method: "qr_manual", reference: "REF-1", amountMinor: 16011, amountReceivedMinor: null, changeMinor: null },
  ],
  note: "This temporary receipt acknowledges initial receipt pending final processing. It does not replace an Official Receipt or final invoice.",
};

describe("which orders have a receipt", () => {
  it("never reads one for pick-up, whatever the state", () => {
    const pickup = { fulfillmentMode: "pickup" as const, state: "completed" };
    expect(receiptStage(pickup)).toBe("pickup");
    expect(readsAcknowledgementReceipt(pickup)).toBe(false);
  });

  it("reads a door order from the door onward, and a cancelled one", () => {
    expect(readsAcknowledgementReceipt({ fulfillmentMode: "delivery", state: "production" })).toBe(false);
    expect(readsAcknowledgementReceipt({ fulfillmentMode: "delivery", state: "rider_assigned" })).toBe(false);
    for (const state of ["picked_up", "out_for_delivery", "delivered", "issue_window_open", "completed", "payout_released", "cancelled"]) {
      expect(readsAcknowledgementReceipt({ fulfillmentMode: "delivery", state })).toBe(true);
    }
  });

  it("says plainly why there is none, and never promises a backfill", () => {
    expect(receiptAbsence({ fulfillmentMode: "delivery", state: "completed" }).body).toBe(
      "This order was delivered before GRIDGO started issuing acknowledgement receipts, so it does not have one. Your order receipt from checkout still lists what you paid.",
    );
    expect(receiptAbsence({ fulfillmentMode: "pickup", state: "completed" }).title).toBe("No acknowledgement receipt for pick-up");
    expect(receiptAbsence({ fulfillmentMode: "delivery", state: "out_for_delivery" }).title).toBe("Not issued yet");
    expect(receiptAbsence({ fulfillmentMode: "delivery", state: "production" }).body).toMatch(/reaches your door/);
    expect(receiptAbsence({ fulfillmentMode: "delivery", state: "cancelled" }).title).toBe("No acknowledgement receipt");
  });
});

describe("drawing the receipt", () => {
  it("dates the receipt in Davao time and links to it", () => {
    expect(issuedStamp("2026-10-21T01:00:00.000Z")).toBe("21 Oct 2026, 9:00 AM");
    expect(issuedStamp("not a date")).toBe("Not recorded");
    expect(receiptSummaryLine(RECEIPT)).toBe("AR-0000000007 · 21 Oct 2026, 9:00 AM");
    expect(acknowledgementReceiptHref("ord 1")).toBe("/order/acknowledgement-receipt?orderId=ord%201");
  });

  it("shows a recorded unit rate, and never invents a missing one", () => {
    expect(lineDetail(RECEIPT.lines[0])).toBe("Qty 100 · ₱55.06 each");
    expect(lineDetail(RECEIPT.lines[1])).toBe("Qty 1 · Unit rate not recorded");
  });

  it("keeps delivery, and draws discounts and rounding only when they are not zero", () => {
    expect(receiptAdjustments(RECEIPT)).toEqual([
      { label: "Delivery fee", value: "₱50.00" },
      { label: "Rounding adjustment", value: "−₱0.01" },
    ]);
    expect(
      receiptAdjustments({ ...RECEIPT, organizationDiscountMinor: 2500, voucherDiscountMinor: 1000, roundingAdjustmentMinor: 0 }),
    ).toEqual([
      { label: "Delivery fee", value: "₱50.00" },
      { label: "Organization discount", value: "−₱25.00" },
      { label: "Voucher discount", value: "−₱10.00" },
    ]);
    expect(receiptAdjustments({ ...RECEIPT, roundingAdjustmentMinor: 2 })[1]).toEqual({
      label: "Rounding adjustment",
      value: "+₱0.02",
    });
  });

  it("names the payment type as recorded, never a wallet a manual QR cannot prove", () => {
    expect(paymentTypeLabel({ type: "digital", method: "qr_manual" })).toBe("Digital · QR payment");
    expect(paymentTypeLabel({ type: "digital", method: "gcash" })).toBe("Digital · GCash");
    expect(paymentTypeLabel({ type: "cash", method: "cash" })).toBe("Cash");
    expect(paymentTypeLabel({ type: "unknown", method: null })).toBe("Not recorded");
    expect(paymentTypeLabel({ type: "unknown", method: "something_new" })).toBe("Not recorded");
  });

  it("lists the reference as recorded, and received and change only for cash", () => {
    expect(paymentRows(RECEIPT.payments[0])).toEqual([
      { label: "Amount", value: "₱160.11" },
      { label: "Payment type", value: "Digital · QR payment" },
      { label: "Reference", value: "REF-1" },
    ]);
    expect(
      paymentRows({ code: "final_cash", type: "cash", method: "cash", reference: null, amountMinor: 5000, amountReceivedMinor: 10000, changeMinor: null }),
    ).toEqual([
      { label: "Amount", value: "₱50.00" },
      { label: "Payment type", value: "Cash" },
      { label: "Reference", value: "Not recorded" },
      { label: "Amount received", value: "₱100.00" },
      { label: "Change", value: "Not recorded" },
    ]);
  });

  it("words a failed read by what went wrong", () => {
    expect(receiptReadError(new ApiError(404, { error: "order_not_found" })).title).toBe("Order not found");
    expect(receiptReadError(new ApiError(403, { error: "forbidden" })).title).toBe("Not your receipt");
    expect(receiptReadError(new ApiError(500, { error: "internal" })).title).toBe("Receipt did not load");
    expect(receiptReadError(new TypeError("Network request failed")).body).toMatch(/Check your connection/);
  });
});

describe("downloading the PDF", () => {
  beforeEach(() => save.mockReset());

  it("saves the signed-in PDF under its AR number", async () => {
    save.mockResolvedValue({ kind: "saved", message: "Downloaded AR-0000000007.pdf." });
    await expect(downloadAcknowledgementReceipt(RECEIPT)).resolves.toEqual({
      ok: true,
      message: "Downloaded AR-0000000007.pdf.",
    });
    const [request, name, mime] = save.mock.calls[0];
    expect(request.url).toMatch(/\/orders\/ord_1\/acknowledgement-receipt\/download$/);
    expect(request.headers.Accept).toBe("application/pdf");
    expect(name).toBe("AR-0000000007.pdf");
    expect(mime).toBe("application/pdf");
  });

  it("words each refusal", async () => {
    save.mockResolvedValueOnce({ kind: "refused", status: 404, body: '{"error":"acknowledgement_receipt_not_found"}' });
    expect(await downloadAcknowledgementReceipt(RECEIPT)).toEqual({
      ok: false,
      message: "GRIDGO has not issued an acknowledgement receipt for this order.",
    });
    save.mockResolvedValueOnce({ kind: "refused", status: 403, body: '{"error":"forbidden"}' });
    expect((await downloadAcknowledgementReceipt(RECEIPT)).message).toMatch(/account that placed the order/);
    save.mockResolvedValueOnce({ kind: "refused", status: 500, body: "" });
    expect((await downloadAcknowledgementReceipt(RECEIPT)).message).toBe("GRIDGO could not prepare the receipt PDF. Try again in a moment.");
  });

  it("says when this phone needs a rebuild, and when the network failed", async () => {
    save.mockResolvedValueOnce({ kind: "unavailable" });
    expect(await downloadAcknowledgementReceipt(RECEIPT)).toEqual({ ok: false, message: RECEIPT_DOWNLOAD_NEEDS_REBUILD });
    save.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect((await downloadAcknowledgementReceipt(RECEIPT)).message).toMatch(/Check your connection/);
  });
});
