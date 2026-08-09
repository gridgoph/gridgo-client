import {
  actorLabel,
  formatPaymentSummary,
  paymentMethodLabel,
  userFacingError,
} from "@/lib/copy";
import { ApiError } from "@/lib/api";

describe("payment copy", () => {
  it("never shows raw method codes", () => {
    expect(paymentMethodLabel("pilot_credit")).toBe("Pilot Credits");
    expect(paymentMethodLabel("cod")).toBe("Cash on Delivery");
    expect(formatPaymentSummary("pilot_credit", "authorized")).toBe(
      "Pilot Credits · Authorized",
    );
  });
});

describe("actorLabel", () => {
  it("maps known roles without leaking user ids", () => {
    expect(actorLabel("user_client")).toBe("You");
    expect(actorLabel("user_supplier")).toBe("Supplier");
    expect(actorLabel("system")).toBe("System");
    expect(actorLabel("user_ops")).toBe("Operations");
    expect(actorLabel("user_xyz")).not.toMatch(/user_/);
  });
});


describe("userFacingError", () => {
  it("maps API codes to recovery copy", () => {
    const err = new ApiError(409, { error: "cod_one_active" });
    expect(userFacingError(err, "fallback")).toMatch(/unpaid Cash on Delivery/i);
    expect(userFacingError(err, "fallback")).not.toMatch(/cod_one_active/);
  });

  it("explains credits shortfall from 402 body", () => {
    const err = new ApiError(402, {
      error: "insufficient_credits",
      needMinor: 135000,
      balanceMinor: 50000,
    });
    const msg = userFacingError(err, "fallback");
    expect(msg).toMatch(/short/);
    expect(msg).not.toMatch(/insufficient_credits/);
  });
});
