import type { Order, PaymentInstallment } from "@/lib/api";
import {
  BALANCE_DUE_STATES,
  balanceDue,
  checkPaymentReference,
  downpaymentDue,
  downpaymentPercentOf,
  installmentLabel,
  installmentSharePercent,
  installmentUnderReview,
  isInstallmentConfirmed,
  LEGACY_DOWNPAYMENT_PERCENT,
  payableInstallment,
  payActionTitle,
  paymentPlanNote,
  paymentPlanPreview,
  paysInFull,
  payInstruction,
  settingsDownpaymentPercent,
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

/** A new order: the whole total up front, the balance marked not required. */
function paidInFullOrder(state: string, downpayment = "not_submitted", balance = "not_required"): Order {
  return {
    ...order(state),
    downpaymentPercent: 100,
    downpaymentMinor: 112500,
    balanceMinor: 0,
    payments: {
      initial: installment(downpayment, 112500),
      final_online: installment(balance, 0),
    },
  };
}

describe("the legacy split", () => {
  it("is 75 then 25, and they make a whole", () => {
    const legacy = order("awaiting_downpayment");
    expect(LEGACY_DOWNPAYMENT_PERCENT).toBe(75);
    expect(downpaymentPercentOf(legacy)).toBe(75);
    expect(installmentSharePercent("downpayment", legacy)).toBe(75);
    expect(installmentSharePercent("balance", legacy)).toBe(25);
    expect(paysInFull(legacy)).toBe(false);
  });

  it("keeps its downpayment and balance words", () => {
    const legacy = order("production", "confirmed");
    expect(installmentLabel("downpayment", legacy)).toBe("Downpayment");
    expect(installmentLabel("balance", legacy)).toBe("Remaining balance");
    expect(payActionTitle("downpayment", legacy)).toBe("Pay the 75% downpayment");
    expect(payActionTitle("balance", legacy)).toBe("Pay the remaining 25%");
  });
});

describe("paid in full", () => {
  it("is read from the percentage, a zero balance, or a not_required balance", () => {
    expect(paysInFull(paidInFullOrder("awaiting_initial_payment"))).toBe(true);
    expect(paysInFull({ ...order("production"), balanceMinor: 0 })).toBe(true);
    expect(
      paysInFull({
        ...order("production"),
        payments: { downpayment: installment("confirmed"), balance: installment("not_required", null) },
      }),
    ).toBe(true);
    expect(paysInFull({ ...order("production"), downpaymentPercent: 100, balanceMinor: null })).toBe(true);
    expect(downpaymentPercentOf({ ...order("production"), balanceMinor: 0 })).toBe(100);
  });

  it("never asks for a balance, in any state", () => {
    for (const state of BALANCE_DUE_STATES) {
      const full = paidInFullOrder(state, "confirmed");
      expect(balanceDue(full)).toBe(false);
      expect(payableInstallment(full)).toBeNull();
      expect(installmentUnderReview(full)).toBeNull();
    }
  });

  it("still asks for the one payment", () => {
    expect(downpaymentDue(paidInFullOrder("awaiting_initial_payment"))).toBe(true);
    expect(payableInstallment(paidInFullOrder("awaiting_initial_payment"))).toBe("downpayment");
  });

  it("names it a payment in full, never a downpayment", () => {
    expect(installmentLabel("downpayment", paidInFullOrder("awaiting_initial_payment"))).toBe("Pay in full");
    expect(installmentLabel("downpayment", paidInFullOrder("production", "confirmed"))).toBe("Paid in full");
    expect(payActionTitle("downpayment", paidInFullOrder("awaiting_initial_payment"))).toBe("Pay in full");
    expect(installmentSharePercent("balance", paidInFullOrder("production"))).toBe(0);
  });

  it("does not crash on a status added after this build", () => {
    const odd = paidInFullOrder("production", "some_future_status", "another_future_status");
    expect(() => payableInstallment(odd)).not.toThrow();
    expect(balanceDue(odd)).toBe(false);
    expect(installmentUnderReview(odd)).toBeNull();
    const legacyOdd = order("production", "confirmed", "some_future_status");
    expect(balanceDue(legacyOdd)).toBe(false);
    expect(paysInFull(legacyOdd)).toBe(false);
  });
});

describe("the plan a basket is written under", () => {
  it("reads the setting, and falls back to 75 on an API without one", () => {
    expect(settingsDownpaymentPercent({ downpaymentPercent: 100 })).toBe(100);
    expect(settingsDownpaymentPercent({ downpaymentPercent: 75 })).toBe(75);
    expect(settingsDownpaymentPercent({})).toBe(75);
    expect(settingsDownpaymentPercent(null)).toBe(75);
    expect(settingsDownpaymentPercent({ downpaymentPercent: 0 })).toBe(75);
  });

  it("says pay in full, or names both halves", () => {
    expect(paymentPlanNote(100)).toMatch(/whole total now/);
    expect(paymentPlanNote(100)).not.toMatch(/%|the rest/);
    expect(paymentPlanNote(75)).toMatch(/75% now and the rest before delivery/);
    expect(paymentPlanPreview(100)).not.toMatch(/%/);
    expect(paymentPlanPreview(75)).toBe("pay 75% by QR then the last 25% before delivery");
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
  it("waits until the job is on the press, not until the downpayment clears", () => {
    // Asking for both back to back would collect the whole price up front and
    // make the split a fiction. It opens once the job is actually being made,
    // which is early enough to be settled before a rider is ever sent for it.
    expect(balanceDue(order("payment_authorized", "confirmed"))).toBe(false);
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
