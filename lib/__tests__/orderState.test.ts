import {
  getOrderStateMeta,
  isAwaitingPaymentState,
  isTrackingState,
  orderGrandTotalMinor,
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

describe("orderGrandTotalMinor", () => {
  it("sums print and delivery fees", () => {
    expect(orderGrandTotalMinor({ totalMinor: 120000, deliveryFeeMinor: 15000 })).toBe(135000);
  });
});
