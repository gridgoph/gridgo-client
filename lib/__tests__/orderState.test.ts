import type { Order } from "@/lib/api";
import {
  collectsAtOffice,
  formatPriceRange,
  getOrderStateMeta,
  isAwaitingCollectionState,
  isClientCorrectionState,
  isProofApprovalState,
  isTrackingState,
  latestNoteForState,
  orderNeedsClient,
  orderNextAction,
  orderTotalMinor,
  orderWaitingOn,
  showsFulfilmentProgress,
} from "@/lib/orderState";

/** An order in one state, with whatever money and payment shape a case needs. */
function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "user_client",
    supplierId: null,
    riderId: null,
    state: "submitted",
    productId: "prod_tarpaulin",
    title: "Grand opening tarpaulin",
    quantity: 1,
    size: "3x6 ft",
    material: "13oz tarpaulin",
    deadline: null,
    address: "JP Laurel Ave, Davao City",
    zone: "davao_central",
    subtotalMinor: null,
    deliveryFeeMinor: null,
    totalMinor: null,
    downpaymentMinor: null,
    balanceMinor: null,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
    timeline: [],
    ...overrides,
  };
}

/** The captain's worked example: ₱1,000 supplier price → ₱1,125 to the client. */
function pricedOrder(overrides: Partial<Order> = {}): Order {
  return order({
    supplierId: "user_supplier",
    subtotalMinor: 110000,
    deliveryFeeMinor: 2500,
    totalMinor: 112500,
    downpaymentMinor: 84375,
    balanceMinor: 28125,
    paymentMethod: "qr_manual",
    payments: {
      downpayment: {
        amountMinor: 84375,
        method: "qr_manual",
        status: "not_submitted",
        reference: null,
        submittedAt: null,
        confirmedAt: null,
      },
      balance: {
        amountMinor: 28125,
        method: "qr_manual",
        status: "not_submitted",
        reference: null,
        submittedAt: null,
        confirmedAt: null,
      },
    },
    ...overrides,
  });
}

function withPayments(
  base: Order,
  downpayment: string,
  balance: string,
): Order {
  return {
    ...base,
    payments: {
      downpayment: { ...base.payments!.downpayment, status: downpayment },
      balance: { ...base.payments!.balance, status: balance },
    },
  };
}

describe("getOrderStateMeta", () => {
  it("returns icon + label + tone for known states", () => {
    const meta = getOrderStateMeta("proof_approval");
    expect(meta.label).toBe("Proof approval");
    expect(meta.tone).toBe("warning");
    expect(meta.icon).toBe("square-pen");
  });

  it("names every v2 state in plain language", () => {
    for (const state of [
      "draft",
      "submitted",
      "needs_qa",
      "client_correction",
      "proof_approval",
      "approved_for_matching",
      "supplier_assigned",
      "awaiting_downpayment",
      "downpayment_review",
      "payment_authorized",
      "production",
      "supplier_self_qc",
      "ready_for_dispatch",
      "rider_assigned",
      "picked_up",
      "out_for_delivery",
      "delivered",
      "issue_window_open",
      "completed",
      "payout_released",
    ]) {
      const meta = getOrderStateMeta(state);
      expect(meta.label).not.toBe("In progress");
      expect(meta.label).not.toMatch(/_/);
    }
  });

  it("never surfaces snake_case for unknown states", () => {
    // Including the retired supplier-proof states, if a migrated record ever
    // still carries one.
    for (const state of ["custom_hold", "supplier_proof_review", "awaiting_payment"]) {
      const meta = getOrderStateMeta(state);
      expect(meta.label).toBe("In progress");
      expect(meta.label).not.toMatch(/_/);
    }
  });
});

describe("order state predicates", () => {
  it("flags tracking states", () => {
    expect(isTrackingState("out_for_delivery")).toBe(true);
    expect(isTrackingState("submitted")).toBe(false);
  });

  it("keeps the one proof decision the client still owns", () => {
    expect(isProofApprovalState("proof_approval")).toBe(true);
    // The supplier print proof loop was removed from the platform.
    expect(isProofApprovalState("supplier_proof_review")).toBe(false);
    expect(isClientCorrectionState("client_correction")).toBe(true);
  });

  it("shows fulfilment progress from production onward, not before", () => {
    expect(showsFulfilmentProgress("payment_authorized")).toBe(true);
    expect(showsFulfilmentProgress("production")).toBe(true);
    expect(showsFulfilmentProgress("completed")).toBe(true);
    expect(showsFulfilmentProgress("submitted")).toBe(false);
    expect(showsFulfilmentProgress("awaiting_downpayment")).toBe(false);
  });
});

describe("orderNextAction", () => {
  it("names what the client does next, in their words", () => {
    expect(orderNextAction(order({ state: "client_correction" }))?.title).toBe(
      "Replace the artwork",
    );
    expect(
      orderNextAction(pricedOrder({ state: "awaiting_downpayment" }))?.title,
    ).toBe("Pay the 75% downpayment");
  });

  it("asks for the downpayment with the real figures on it", () => {
    const body = orderNextAction(pricedOrder({ state: "awaiting_downpayment" }))?.body ?? "";
    expect(body).toContain("₱843.75");
    expect(body).toContain("₱1,125.00");
    // The supplier's own price and GRIDGO's margin are never in it.
    expect(body).not.toContain("₱1,000");
    expect(body).not.toContain("₱100.00");
  });

  it("asks for the balance once the job is on the press, not at the door", () => {
    const confirmed = (state: string) =>
      withPayments(pricedOrder({ state }), "confirmed", "not_submitted");

    // A rider must never be sent to a door that has not paid, so the ask comes
    // early enough to clear before the job is ever packed.
    expect(orderNextAction(confirmed("payment_authorized"))).toBeNull();
    expect(orderNextAction(confirmed("production"))?.title).toBe("Pay the remaining 25%");
    expect(orderNextAction(confirmed("ready_for_dispatch"))?.title).toBe(
      "Pay the remaining 25%",
    );
    expect(orderNextAction(confirmed("out_for_delivery"))?.title).toBe(
      "Pay the remaining 25%",
    );
  });

  it("never asks for the balance before the downpayment has cleared", () => {
    const pending = withPayments(
      pricedOrder({ state: "ready_for_dispatch" }),
      "pending_confirmation",
      "not_submitted",
    );
    expect(orderNextAction(pending)).toBeNull();
  });

  it("asks for nothing while a payment is being checked", () => {
    const submitted = withPayments(
      pricedOrder({ state: "downpayment_review" }),
      "pending_confirmation",
      "not_submitted",
    );
    expect(orderNextAction(submitted)).toBeNull();
    expect(orderWaitingOn(submitted)).toMatch(/checking your downpayment/i);
  });

  it("says a correction keeps the same job rather than starting a new one", () => {
    expect(orderNextAction(order({ state: "client_correction" }))?.body).toMatch(
      /stay as they are/i,
    );
  });

  it("is null where the job is with someone else and nothing is owed", () => {
    const settled = withPayments(
      pricedOrder({ state: "production" }),
      "confirmed",
      "confirmed",
    );
    expect(orderNextAction(settled)).toBeNull();
    expect(orderWaitingOn(settled)).toMatch(/press/i);
  });

  it("never leaks a state string into the copy", () => {
    const cases = [
      order({ state: "client_correction" }),
      order({ state: "proof_approval" }),
      pricedOrder({ state: "awaiting_downpayment" }),
      withPayments(pricedOrder({ state: "ready_for_dispatch" }), "confirmed", "not_submitted"),
      order({ state: "issue_window_open" }),
    ];
    for (const candidate of cases) {
      expect(orderNextAction(candidate)?.body).not.toMatch(/[a-z]+_[a-z]+/);
      expect(orderNextAction(candidate)?.title).not.toMatch(/[a-z]+_[a-z]+/);
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

  it("does not throw when the order carried no history", () => {
    expect(latestNoteForState(undefined, "client_correction")).toBeNull();
    expect(latestNoteForState(null, "client_correction")).toBeNull();
  });
});

describe("orderTotalMinor", () => {
  it("is the total the server sent — the captain's ₱1,125", () => {
    expect(orderTotalMinor(pricedOrder())).toBe(112500);
  });

  it("falls back to subtotal plus delivery when the total is missing", () => {
    expect(orderTotalMinor(pricedOrder({ totalMinor: null }))).toBe(112500);
  });

  it("is null before a supplier has accepted, never zero", () => {
    expect(orderTotalMinor(order())).toBeNull();
  });
});

describe("formatPriceRange", () => {
  it("reads as one figure when both ends agree", () => {
    expect(formatPriceRange(148500, 148500)).toBe("₱1,485.00");
  });

  it("reads as a range when they do not", () => {
    expect(formatPriceRange(49500, 55000)).toBe("₱495.00 – ₱550.00");
  });
});

describe("orderNeedsClient", () => {
  it("is true exactly for the states that carry a client action", () => {
    expect(orderNeedsClient(order({ state: "client_correction" }))).toBe(true);
    expect(orderNeedsClient(order({ state: "proof_approval" }))).toBe(true);
    expect(orderNeedsClient(order({ state: "issue_window_open" }))).toBe(true);
    expect(orderNeedsClient(pricedOrder({ state: "awaiting_downpayment" }))).toBe(true);
    expect(
      orderNeedsClient(
        withPayments(pricedOrder({ state: "ready_for_dispatch" }), "confirmed", "not_submitted"),
      ),
    ).toBe(true);
  });

  it("is false while the job is with GRIDGO, a supplier or a rider", () => {
    for (const state of [
      "submitted",
      "needs_qa",
      "approved_for_matching",
      "supplier_assigned",
      "downpayment_review",
      "production",
      "completed",
    ]) {
      expect(orderNeedsClient(order({ state }))).toBe(false);
    }
  });

  it("is false for a state this app has never heard of", () => {
    expect(orderNeedsClient(order({ state: "some_new_state" }))).toBe(false);
  });
});

/**
 * A client who is collecting is not being delivered to.
 *
 * A rider does carry the job, but only between two of GRIDGO's own places — the
 * shop that printed it and the office counter. Told it is "out for delivery",
 * a client waits at home for something sitting on our shelf.
 */
describe("a collected order speaks its own language", () => {
  const collecting = (state: string) => order({ state, fulfillmentMode: "pickup" });
  const collectingPriced = (state: string) =>
    pricedOrder({ state, fulfillmentMode: "pickup" });

  it("never says delivery to somebody coming to fetch it", () => {
    for (const state of ["rider_assigned", "picked_up", "out_for_delivery"]) {
      expect(getOrderStateMeta(state, "pickup").label).not.toMatch(/deliver/i);
      expect(orderWaitingOn(collecting(state))).not.toMatch(/out for delivery/i);
    }
    // And a delivery is untouched by any of it.
    expect(getOrderStateMeta("out_for_delivery").label).toBe("Out for delivery");
  });

  it("names the office as the destination", () => {
    expect(getOrderStateMeta("picked_up", "pickup").label).toMatch(/GRIDGO Office/);
    expect(getOrderStateMeta("awaiting_collection", "pickup").label).toBe("Ready for pickup");
    expect(getOrderStateMeta("delivered", "pickup").label).toBe("Collected");
  });

  it("waiting on the counter is something the client must act on", () => {
    expect(isAwaitingCollectionState("awaiting_collection")).toBe(true);
    expect(collectsAtOffice(collecting("awaiting_collection"))).toBe(true);
    expect(collectsAtOffice(order({ state: "out_for_delivery" }))).toBe(false);

    const ready = withPayments(
      collectingPriced("awaiting_collection"),
      "confirmed",
      "confirmed",
    );
    expect(orderNextAction(ready)?.title).toBe("Collect at GRIDGO Office");
    expect(orderNeedsClient(ready)).toBe(true);
  });

  it("asks for the balance before the walk, not after it", () => {
    const owing = withPayments(
      collectingPriced("awaiting_collection"),
      "confirmed",
      "not_submitted",
    );
    // The money comes first: a client who travels for a package we will not
    // release has made the trip for nothing.
    expect(orderNextAction(owing)?.title).toBe("Pay the remaining 25%");
    expect(orderNextAction(owing)?.body).toMatch(/counter/i);
  });

  it("still shows the job as being fulfilled while it waits on the shelf", () => {
    expect(showsFulfilmentProgress("awaiting_collection")).toBe(true);
  });
});
