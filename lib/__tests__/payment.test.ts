import {
  COD_LIMIT_MINOR,
  creditsShortfallMinor,
  evaluateCodEligibility,
  formatCreditsShortfallMessage,
  isActiveUnpaidCodOrder,
} from "@/lib/payment";

describe("COD eligibility", () => {
  const baseOrder = {
    id: "ord_1",
    paymentMethod: null as string | null,
    paymentStatus: "unpaid",
    state: "awaiting_payment",
  };

  it("rejects totals above ₱1,500", () => {
    const result = evaluateCodEligibility(COD_LIMIT_MINOR + 1, []);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/₱1,500/);
  });

  it("allows totals at the limit with no other COD", () => {
    const result = evaluateCodEligibility(COD_LIMIT_MINOR, [baseOrder]);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("rejects when another unpaid COD is active", () => {
    const result = evaluateCodEligibility(50_000, [
      {
        id: "ord_other",
        paymentMethod: "cod",
        paymentStatus: "authorized",
        state: "production",
      },
    ]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/only one/i);
  });

  it("ignores collected or completed COD orders", () => {
    const result = evaluateCodEligibility(50_000, [
      {
        id: "ord_done",
        paymentMethod: "cod",
        paymentStatus: "collected",
        state: "issue_window_open",
      },
    ]);
    expect(result.eligible).toBe(true);
  });

  it("detects active unpaid COD", () => {
    expect(
      isActiveUnpaidCodOrder({
        id: "x",
        paymentMethod: "cod",
        paymentStatus: "authorized",
        state: "production",
      }),
    ).toBe(true);
    expect(
      isActiveUnpaidCodOrder({
        id: "x",
        paymentMethod: "pilot_credit",
        paymentStatus: "authorized",
        state: "production",
      }),
    ).toBe(false);
  });
});

describe("credits shortfall", () => {
  it("computes shortfall and message", () => {
    expect(creditsShortfallMinor(135000, 50000)).toBe(85000);
    expect(formatCreditsShortfallMessage(135000, 50000)).toMatch(/short by/);
    expect(formatCreditsShortfallMessage(135000, 50000)).toMatch(/cannot be topped up/i);
  });
});
