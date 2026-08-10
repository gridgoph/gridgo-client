import type { Order, PaymentInstallment } from "@/lib/api";
import {
  BALANCE_DUE_STATES,
  BALANCE_PERCENT,
  balanceDue,
  checkPaymentReference,
  DOWNPAYMENT_PERCENT,
  downpaymentDue,
  installmentUnderReview,
  isInstallmentConfirmed,
  payableInstallment,
  payInstruction,
} from "@/lib/payment";

function installment(status: string, amountMinor: number | null = 84375): PaymentInstallment {
  return {
    amountMinor,
    method: "qr_manual",
    status,
    reference: status === "not_submitted" ? null : "GCASH-ABC123",
    submittedAt: status === "not_submitted" ? null : "2026-08-10T10:00:00.000Z",
    confirmedAt: status === "confirmed" ? "2026-08-10T11:00:00.000Z" : null,
  };
}

function order(
  state: string,
  downpayment = "not_submitted",
  balance = "not_submitted",
): Order {
  return {
    id: "ord_1",
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    state,
    productId: "prod_tarpaulin",
    title: "Grand opening tarpaulin",
    quantity: 1,
    size: "3x6 ft",
    material: "13oz tarpaulin",
    deadline: null,
    address: "JP Laurel Ave",
    zone: "davao_central",
    subtotalMinor: 110000,
    deliveryFeeMinor: 2500,
    totalMinor: 112500,
    downpaymentMinor: 84375,
    balanceMinor: 28125,
    paymentMethod: "qr_manual",
    paymentStatus: "unpaid",
    payments: {
      downpayment: installment(downpayment, 84375),
      balance: installment(balance, 28125),
    },
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
    timeline: [],
  };
}

describe("the split", () => {
  it("is 75 then 25, and they make a whole", () => {
    expect(DOWNPAYMENT_PERCENT).toBe(75);
    expect(BALANCE_PERCENT).toBe(25);
    expect(DOWNPAYMENT_PERCENT + BALANCE_PERCENT).toBe(100);
  });
});

describe("downpaymentDue", () => {
  it("is due in the state the platform opens it in", () => {
    expect(downpaymentDue(order("awaiting_downpayment"))).toBe(true);
  });

  it("is not due once it has been sent for checking or confirmed", () => {
    expect(downpaymentDue(order("downpayment_review", "pending_confirmation"))).toBe(false);
    expect(downpaymentDue(order("payment_authorized", "confirmed"))).toBe(false);
  });

  it("is not due before a supplier has accepted and priced the job", () => {
    // The API refuses this with `assignment_notification_required`; the app
    // must not ask for it in the first place.
    for (const state of ["submitted", "needs_qa", "approved_for_matching", "supplier_assigned"]) {
      expect(downpaymentDue(order(state))).toBe(false);
    }
  });
});

describe("balanceDue", () => {
  it("waits until the job is packed, not until the downpayment clears", () => {
    // Asking for both back to back would collect the whole price up front and
    // make the split a fiction.
    expect(balanceDue(order("payment_authorized", "confirmed"))).toBe(false);
    expect(balanceDue(order("production", "confirmed"))).toBe(false);
    expect(balanceDue(order("supplier_self_qc", "confirmed"))).toBe(false);
    for (const state of BALANCE_DUE_STATES) {
      expect(balanceDue(order(state, "confirmed"))).toBe(true);
    }
  });

  it("never opens before the downpayment is confirmed", () => {
    expect(balanceDue(order("ready_for_dispatch", "pending_confirmation"))).toBe(false);
    expect(balanceDue(order("ready_for_dispatch", "not_submitted"))).toBe(false);
  });

  it("closes once it is submitted", () => {
    expect(balanceDue(order("out_for_delivery", "confirmed", "pending_confirmation"))).toBe(false);
    expect(balanceDue(order("out_for_delivery", "confirmed", "confirmed"))).toBe(false);
  });

  it("treats a migrated order's legacy confirmation as paid", () => {
    // Orders that cleared under the old single authorization must not be
    // asked to pay a second time.
    expect(balanceDue(order("ready_for_dispatch", "legacy_confirmed", "legacy_confirmed"))).toBe(
      false,
    );
    expect(isInstallmentConfirmed(installment("legacy_confirmed"))).toBe(true);
  });
});

describe("installmentUnderReview", () => {
  it("names the half that is with Operations", () => {
    expect(installmentUnderReview(order("downpayment_review", "pending_confirmation"))).toBe(
      "downpayment",
    );
    expect(
      installmentUnderReview(order("out_for_delivery", "confirmed", "pending_confirmation")),
    ).toBe("balance");
    expect(installmentUnderReview(order("production", "confirmed"))).toBeNull();
  });
});

describe("payableInstallment", () => {
  it("never asks for two payments at once", () => {
    const states = [
      "awaiting_downpayment",
      "downpayment_review",
      "payment_authorized",
      "production",
      "ready_for_dispatch",
      "out_for_delivery",
      "completed",
    ];
    for (const state of states) {
      const result = payableInstallment(order(state, "confirmed"));
      expect(result === null || result === "downpayment" || result === "balance").toBe(true);
    }
  });
});

describe("payment copy", () => {
  it("never offers cash or credits", () => {
    for (const code of ["downpayment", "balance"] as const) {
      const copy = payInstruction(code);
      expect(copy).not.toMatch(/cash/i);
      expect(copy).not.toMatch(/credit/i);
      expect(copy).toMatch(/QR/);
    }
  });
});

describe("checkPaymentReference", () => {
  it("accepts a real wallet reference", () => {
    expect(checkPaymentReference("0047 5518 2290").ok).toBe(true);
  });

  it("says what to do rather than only that it is wrong", () => {
    expect(checkPaymentReference("").reason).toMatch(/receipt/i);
    expect(checkPaymentReference("  ").ok).toBe(false);
    expect(checkPaymentReference("12").reason).toMatch(/13 characters/);
    expect(checkPaymentReference("x".repeat(200)).reason).toMatch(/reference number/i);
  });

  it("never returns an error code", () => {
    for (const value of ["", "12", "x".repeat(200)]) {
      expect(checkPaymentReference(value).reason).not.toMatch(/^[a-z_]+$/);
    }
  });
});
