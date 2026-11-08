import {
  PRINT_END_FRAME,
  PRINT_FEED_MS,
  RECEIPT_FOOTER_MAX_SHARE,
  RECEIPT_PRINT_BUDGET_MS,
  thanksFitsFooter,
  printStartFrame,
  RECEIPT_PRINT_TOTAL_MS,
  SLIP_UNMEASURED_OFFSET,
  slipFeedFrom,
} from "@/lib/receiptPrint";

describe("receipt print timeline", () => {
  it("never holds the client up past the ~2 s budget (#229)", () => {
    expect(RECEIPT_PRINT_BUDGET_MS).toBe(2000);
    expect(RECEIPT_PRINT_TOTAL_MS).toBeLessThanOrEqual(RECEIPT_PRINT_BUDGET_MS);
  });

  it("feeds slowly enough to follow, not the 1 s blur that was reported (B2911823)", () => {
    expect(PRINT_FEED_MS).toBeGreaterThanOrEqual(1400);
  });

  it("starts with the slip in place and the thank-you shown under reduce motion", () => {
    expect(printStartFrame(true)).toEqual(PRINT_END_FRAME);
    expect(PRINT_END_FRAME).toEqual({ slipOffset: 0, thanksOpacity: 1 });
  });

  it("otherwise starts with the slip tucked in the slot and the thank-you hidden", () => {
    expect(printStartFrame(false)).toEqual({ slipOffset: SLIP_UNMEASURED_OFFSET, thanksOpacity: 0 });
  });

  it("feeds a measured slip from its full height", () => {
    expect(slipFeedFrom(612.4)).toBe(-613);
    expect(slipFeedFrom(-5)).toBe(0);
  });
});

describe("the pinned panel under the slip", () => {
  it("keeps the one-line thank-you pinned on a small and a tall phone", () => {
    // One line of thanks plus one row of buttons: about 130 px.
    expect(thanksFitsFooter(640, 130)).toBe(true);
    expect(thanksFitsFooter(844, 130)).toBe(true);
  });

  it("moves the thank-you under the slip when the panel would cover too much of it", () => {
    // The old panel: thanks, two lines of next steps, two stacked buttons.
    expect(thanksFitsFooter(640, 250)).toBe(false);
    expect(thanksFitsFooter(844, 267)).toBe(false);
    expect(640 * RECEIPT_FOOTER_MAX_SHARE).toBe(160);
  });

  it("keeps it pinned until it has been measured", () => {
    expect(thanksFitsFooter(0, 300)).toBe(true);
    expect(thanksFitsFooter(640, 0)).toBe(true);
  });
});
