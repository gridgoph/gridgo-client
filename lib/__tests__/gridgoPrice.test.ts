import { clientFromPriceMinorOf, gridgoAmountMinor, roundBps } from "@/lib/gridgoPrice";

describe("gridgoAmountMinor", () => {
  it("marks ₱12.00 up to ₱17.40 at 4_500 bps and ₱13.20 at 1_000 bps", () => {
    expect(gridgoAmountMinor(1_200, 4_500)).toBe(1_740);
    expect(gridgoAmountMinor(1_200, 1_000)).toBe(1_320);
  });

  it("uses integer half-up rounding, never a float", () => {
    expect(roundBps(1_200, 4_500)).toBe(540);
    expect(gridgoAmountMinor(0, 4_500)).toBe(0);
    expect(gridgoAmountMinor(null, 4_500)).toBeNull();
  });
});

describe("clientFromPriceMinorOf", () => {
  it("prefers the API's GRIDGO field when the payload already has one", () => {
    expect(clientFromPriceMinorOf({ fromPriceMinor: 1_200, clientFromPriceMinor: 1_740 })).toBe(1_740);
  });

  it("applies the live rate when the payload only has the shop figure", () => {
    expect(clientFromPriceMinorOf({ fromPriceMinor: 1_200 }, 4_500)).toBe(1_740);
    expect(clientFromPriceMinorOf({ fromPriceMinor: 1_200 }, 1_000)).toBe(1_320);
  });
});
