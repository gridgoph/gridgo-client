import {
  getOrderStateMeta,
  isAnyProofDecisionState,
  isAwaitingPaymentState,
  isSupplierProofChangesRequestedState,
  isSupplierProofReviewState,
  isTrackingState,
  latestNoteForState,
  orderGrandTotalMinor,
  orderNextAction,
  orderWaitingOn,
} from "@/lib/orderState";

describe("getOrderStateMeta", () => {
  it("returns icon + label + tone for known states", () => {
    const meta = getOrderStateMeta("proof_approval");
    expect(meta.label).toBe("Proof approval");
    expect(meta.tone).toBe("warning");
    expect(meta.icon).toBe("square-pen");
  });

  it("never surfaces snake_case for unknown states", () => {
    const meta = getOrderStateMeta("custom_hold");
    expect(meta.label).toBe("In progress");
    expect(meta.tone).toBe("neutral");
    expect(meta.label).not.toMatch(/_/);
  });
});

describe("order state predicates", () => {
  it("flags tracking states", () => {
    expect(isTrackingState("out_for_delivery")).toBe(true);
    expect(isTrackingState("submitted")).toBe(false);
  });

  it("flags awaiting payment", () => {
    expect(isAwaitingPaymentState("awaiting_payment")).toBe(true);
    expect(isAwaitingPaymentState("production")).toBe(false);
  });
});

describe("supplier proof states", () => {
  it("gives the supplier proof states plain labels", () => {
    expect(getOrderStateMeta("supplier_proof_review").label).toBe("Proof approval");
    expect(getOrderStateMeta("supplier_proof_changes_requested").label).toBe("Changes requested");
    expect(getOrderStateMeta("supplier_proof_approved").label).toBe("Proof approved");
  });

  it("separates the two proofs a client may be asked to approve", () => {
    expect(isSupplierProofReviewState("supplier_proof_review")).toBe(true);
    expect(isSupplierProofReviewState("proof_approval")).toBe(false);
    expect(isAnyProofDecisionState("proof_approval")).toBe(true);
    expect(isAnyProofDecisionState("supplier_proof_review")).toBe(true);
    expect(isAnyProofDecisionState("production")).toBe(false);
  });

  it("knows a proof sent back is waiting on the supplier, not the client", () => {
    expect(isSupplierProofChangesRequestedState("supplier_proof_changes_requested")).toBe(true);
    expect(orderNextAction("supplier_proof_changes_requested")).toBeNull();
    expect(orderWaitingOn("supplier_proof_changes_requested")).toMatch(/supplier/i);
  });
});

describe("orderNextAction", () => {
  it("names what the client does next, in their words", () => {
    expect(orderNextAction("client_correction")?.title).toBe("Replace the artwork");
    expect(orderNextAction("awaiting_payment")?.title).toBe("Choose how to pay");
  });

  it("says a correction keeps the same job rather than starting a new one", () => {
    expect(orderNextAction("client_correction")?.body).toMatch(/stay as they are/i);
  });

  it("is null where the job is with someone else", () => {
    expect(orderNextAction("production")).toBeNull();
    expect(orderWaitingOn("production")).toMatch(/press/i);
  });

  it("never leaks a state string into the copy", () => {
    for (const state of ["client_correction", "proof_approval", "awaiting_payment"]) {
      expect(orderNextAction(state)?.body).not.toMatch(/[a-z]+_[a-z]+/);
    }
  });
});

describe("latestNoteForState", () => {
  const timeline = [
    { at: "1", state: "client_correction", note: "Bleed is missing on all four edges" },
    { at: "2", state: "submitted", note: "Corrected artwork sent" },
    { at: "3", state: "client_correction", note: "Brand red is out of gamut" },
    { at: "4", state: "needs_qa", note: "" },
  ];

  it("takes the most recent reason, not the first", () => {
    expect(latestNoteForState(timeline, "client_correction")).toBe(
      "Brand red is out of gamut",
    );
  });

  it("returns null when the note was left blank", () => {
    expect(latestNoteForState(timeline, "needs_qa")).toBeNull();
    expect(latestNoteForState(timeline, "production")).toBeNull();
  });
});

describe("orderGrandTotalMinor", () => {
  it("sums print and delivery fees", () => {
    expect(orderGrandTotalMinor({ totalMinor: 120000, deliveryFeeMinor: 15000 })).toBe(135000);
  });
});
