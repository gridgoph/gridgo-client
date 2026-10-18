import { ApiError } from "@/lib/api";
import { cancellationQuoteCopy, cancellationQuoteRefusal, refundBreakdown } from "@/lib/refunds";
import { BEFORE_PRODUCTION_QUOTE, cancellationQuote } from "@/test/cancellationQuote";
import { refundOrder } from "@/test/refundFixtures";

describe("cancellation quote amounts", () => {
  it("returns everything paid before production, delivery and fee included", () => {
    const breakdown = refundBreakdown(BEFORE_PRODUCTION_QUOTE.refund, refundOrder({ state: "payment_authorized" }));
    expect(breakdown).toMatchObject({ printingMinor: 110000, deliveryMinor: 5000, totalMinor: 115000, full: true });
    expect(breakdown.scope).toBe("Full refund — everything you paid");
    expect(breakdown.kept).toBeNull();
    expect(cancellationQuoteCopy(BEFORE_PRODUCTION_QUOTE)).toEqual({
      headline: "You get back ₱1,150.00",
      detail: "Printing has not started, so everything you paid comes back, delivery included.",
    });
  });

  it("returns the paid amount less the work already done once production starts", () => {
    const breakdown = refundBreakdown(cancellationQuote().refund, refundOrder());
    // ₱600 principal + ₱60 proportional fee read as one Printing figure; Printing + Delivery = Total.
    expect(breakdown).toMatchObject({ printingMinor: 66000, deliveryMinor: 5000, totalMinor: 71000, full: false });
    expect(breakdown.printingMinor + breakdown.deliveryMinor).toBe(breakdown.totalMinor);
    expect(breakdown.scope).toBe("Partial refund · ₱710.00 of ₱1,150.00 paid");
    expect(breakdown.kept).toBe("The rest pays for printing work the shop had already done.");
    const copy = cancellationQuoteCopy(cancellationQuote());
    expect(copy.headline).toBe("You get back ₱710.00");
    expect(copy.detail).toMatch(/work already done is kept/);
    // Never GRIDGO's cut in pesos.
    expect(JSON.stringify(copy)).not.toMatch(/₱60\.00|service fee/i);
  });
});

describe("cancellationQuoteRefusal", () => {
  const refusal = (code: string) => cancellationQuoteRefusal(new ApiError(409, { error: code }));

  it.each([
    "cancellation_legacy_review_required",
    "cancellation_manual_review_required",
    "cancellation_delivery_review_required",
  ])("lets %s still be sent for Operations to work out", (code) => {
    expect(refusal(code)).toMatchObject({ kind: "review", code, message: expect.stringMatching(/Operations works out the amount by hand|Operations works out what the trip cost/) });
  });

  it.each([
    ["cancellation_after_delivery", /report a problem/],
    ["refund_state_conflict", /already has a cancellation or refund/],
    ["refund_already_open", /already has a refund request open/],
    ["refund_collection_reconciliation_required", /still checking a payment/],
    ["refund_no_available_funds", /nothing to refund/],
  ])("blocks %s with plain words", (code, words) => {
    const read = refusal(code);
    expect(read).toMatchObject({ kind: "blocked", code });
    expect(read?.message).toMatch(words);
    expect(read?.message).not.toMatch(/_/);
  });

  it("is not a refusal when the order was never reached", () => {
    expect(cancellationQuoteRefusal(new TypeError("Network request failed"))).toBeNull();
    expect(cancellationQuoteRefusal(new ApiError(500, { error: "internal" }))).toBeNull();
  });
});
