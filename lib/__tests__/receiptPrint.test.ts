import {
  PRINT_END_FRAME,
  printStartFrame,
  RECEIPT_PRINT_TOTAL_MS,
  SLIP_UNMEASURED_OFFSET,
  slipFeedFrom,
} from "@/lib/receiptPrint";

describe("receipt print timeline", () => {
  it("finishes inside the ~1.5 s budget", () => {
    expect(RECEIPT_PRINT_TOTAL_MS).toBeLessThanOrEqual(1500);
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
