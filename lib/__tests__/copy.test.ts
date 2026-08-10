import {
  actorLabel,
  formatPaymentSummary,
  paymentMethodLabel,
  roleAppLabel,
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

  it.each([
    ["issue_already_open", /already have a report open/i],
    ["issue_window_closed", /signed off/i],
    ["reason_required", /what needs to change/i],
    ["proof_decision_not_allowed", /no proof waiting/i],
  ])("turns %s into a next step", (code, expected) => {
    const message = userFacingError(new ApiError(409, { error: code }), "fallback");
    expect(message).toMatch(expected);
    expect(message).not.toContain(code);
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

describe("roleAppLabel", () => {
  it("names the app, never the stored role value", () => {
    expect(roleAppLabel("ops_admin")).toBe("GRIDGO Operations");
    expect(roleAppLabel("super_admin")).toBe("GRIDGO Operations");
    expect(roleAppLabel("supplier")).toBe("GRIDGO Supplier");
    expect(roleAppLabel("rider")).toBe("GRIDGO Rider");
  });

  it("stays generic for a role this app has never heard of", () => {
    expect(roleAppLabel("warehouse_lead")).toBe("another GRIDGO app");
    expect(roleAppLabel(null)).toBe("another GRIDGO app");
  });

  it("never returns a snake_case value", () => {
    for (const role of ["client", "supplier", "rider", "ops_admin", "super_admin", "nope"]) {
      expect(roleAppLabel(role)).not.toMatch(/_/);
    }
  });
});
