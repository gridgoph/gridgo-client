import {
  actorLabel,
  clientEmailUnavailableMessage,
  installmentStatusLabel,
  paymentStatusLabel,
  roleAppLabel,
  userFacingError,
} from "@/lib/copy";
import { ApiError } from "@/lib/api";

describe("payment copy", () => {
  it("never shows raw status codes", () => {
    for (const status of [
      "unpaid",
      "downpayment_pending",
      "downpayment_confirmed",
      "paid",
      "authorized",
      "something_new",
    ]) {
      expect(paymentStatusLabel(status)).not.toMatch(/_/);
    }
    for (const status of [
      "not_submitted",
      "pending_confirmation",
      "confirmed",
      "legacy_confirmed",
    ]) {
      expect(installmentStatusLabel(status)).not.toMatch(/_/);
    }
  });

  it("says a submitted payment is being checked, never that it is paid", () => {
    expect(installmentStatusLabel("pending_confirmation")).toBe("Being checked");
    expect(paymentStatusLabel("downpayment_pending")).toMatch(/being checked/i);
  });

  it("offers no cash and no credits anywhere in the vocabulary", () => {
    const everything = [
      paymentStatusLabel("unpaid"),
      paymentStatusLabel("downpayment_pending"),
      paymentStatusLabel("downpayment_confirmed"),
      paymentStatusLabel("paid"),
      installmentStatusLabel("not_submitted"),
      installmentStatusLabel("confirmed"),
    ].join(" ");
    expect(everything).not.toMatch(/cash on delivery/i);
    expect(everything).not.toMatch(/pilot credit/i);
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
  it.each([
    ["issue_already_open", /already have a report open/i],
    ["issue_window_closed", /signed off/i],
    ["reason_required", /what needs to change/i],
    ["proof_decision_not_allowed", /no proof waiting/i],
    ["payment_route_retired", /downpayment and balance/i],
    ["payment_method_not_allowed", /QR only/i],
    ["assignment_notification_required", /no final price yet/i],
    ["payment_already_submitted", /already with Operations/i],
    ["downpayment_not_confirmed", /balance opens once/i],
    ["payment_reference_required", /reference number/i],
    ["email_already_registered", /already has a GRIDGO account/i],
    ["invalid_password", /at least 8 characters/i],
    ["organization_name_required", /business or organization name/i],
    ["invitation_required", /not a GRIDGO client/i],
    ["physical_invoice_already_requested", /already been requested/i],
    ["physical_invoice_not_found", /no physical-invoice request/i],
    ["invoice_not_found", /has not issued a receipt/i],
  ])("turns %s into a next step", (code, expected) => {
    const message = userFacingError(new ApiError(409, { error: code }), "fallback");
    expect(message).toMatch(expected);
    expect(message).not.toContain(code);
  });

  it("names the shop's minimum when GRIDGO refuses a quantity under it", () => {
    const message = userFacingError(
      new ApiError(409, { error: "below_minimum_quantity", minimumOrderQuantity: 10 }),
      "fallback",
    );
    expect(message).toBe("This shop takes orders of 10 and up. Change the quantity and try again.");
    // The API's detail may be missing on an older deployment; the sentence still stands.
    expect(userFacingError(new ApiError(409, { error: "below_minimum_quantity" }), "fallback")).toBe(
      "This shop takes a minimum quantity. Change the quantity and try again.",
    );
  });

  it("names the printer's widest print when GRIDGO refuses a wider line", () => {
    expect(
      userFacingError(
        new ApiError(409, { error: "printer_cap_exceeded", printerMaxWidthFeet: 7 }),
        "fallback",
      ),
    ).toBe("This printer prints up to 7 ft wide. Make it 7 ft wide or less and try again.");
    expect(userFacingError(new ApiError(409, { error: "printer_cap_exceeded" }), "fallback")).toBe(
      "This is wider than this printer prints. Make it narrower and try again.",
    );
  });

  it("tells a client refused cash on delivery what GRIDGO does take", () => {
    const message = userFacingError(
      new ApiError(400, { error: "payment_method_not_allowed" }),
      "fallback",
    );
    expect(message).toMatch(/GCash|Maya|e-wallet/);
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

describe("clientEmailUnavailableMessage", () => {
  it("does not name another GRIDGO app or role", () => {
    expect(clientEmailUnavailableMessage).toBe(
      "This email is not available. Try a different email.",
    );
    expect(clientEmailUnavailableMessage).not.toMatch(/rider|supplier|operations|client/i);
  });
});
