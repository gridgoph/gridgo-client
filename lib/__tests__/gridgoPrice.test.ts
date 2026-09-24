import { clientAmountMinor, clientFromPriceMinorOf, gridgoAmountMinor, roundBps } from "@/lib/gridgoPrice";

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

it("does not expose a shop From price while the client rate is unknown", () => {
  expect(clientFromPriceMinorOf({ fromPriceMinor: 1200 }, null)).toBeNull();
});

it("marks up a measured shop subtotal once, after measuring", () => {
  // Shop: ₱12 per sq ft × 1.45 sq ft = ₱17.40. Client: ₱25.23 for the job.
  expect(clientAmountMinor(1200, 4500)).toBe(1740);
  expect(clientAmountMinor(1740, 4500)).toBe(2523);
  expect(clientAmountMinor(1740, null)).toBeNull();
});
