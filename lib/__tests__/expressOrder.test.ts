import type { ExpressOrder } from "@/lib/api";
import { cancelledAwaitingRefund } from "@/lib/refunds";
import {
  acceptCountdown,
  expressView,
  formatPickupCode,
  ratingBody,
  ratingTags,
} from "@/lib/expressOrder";

function order(express: Partial<ExpressOrder>, fulfillmentMode: "pickup" | "delivery" = "pickup") {
  return {
    fulfillmentMode,
    expressOrder: {
      status: "sending",
      originalSupplierId: "shop_1",
      currentSupplierId: "shop_1",
      declineCount: 0,
      acceptBy: null,
      events: [{ state: "sending", at: "2026-11-19T01:00:00.000Z" }],
      refundRequired: false,
      ...express,
    } as ExpressOrder,
  };
}

describe("expressView", () => {
  it("is checking while GRIDGO holds the order before a shop's timer", () => {
    expect(expressView(order({}), "Corner Print")).toMatchObject({ phase: "checking", railIndex: 0, cancellable: true });
  });

  it("is sending once the five minutes run", () => {
    const view = expressView(order({ acceptBy: "2026-11-19T01:05:00.000Z" }), "Corner Print");
    expect(view).toMatchObject({ phase: "sending", title: "Sending to Corner Print…", cancellable: true });
  });

  it("says moved after a decline or timeout put it with another shop", () => {
    const events = [
      { state: "sending", at: "1" },
      { state: "declined", at: "2", supplierId: "shop_1" },
      { state: "moved", at: "2", supplierId: "shop_2" },
      { state: "sending", at: "2", supplierId: "shop_2" },
    ];
    const view = expressView(order({ events, declineCount: 1, acceptBy: "x" }), "Second Shop");
    expect(view).toMatchObject({ phase: "moved", title: "Moved to Second Shop", cancellable: true });
  });

  it.each([
    ["accepted", "accepted", 1],
    ["printing", "printing", 1],
    ["picked_up", "done", 3],
    ["delivered", "done", 3],
  ])("maps %s", (status, phase, railIndex) => {
    expect(expressView(order({ status }), "Shop")).toMatchObject({ phase, railIndex, cancellable: false });
  });

  it("is ready with a code for pickup and on its way for delivery", () => {
    expect(expressView(order({ status: "ready" }), "Shop").phase).toBe("ready");
    expect(expressView(order({ status: "ready" }, "delivery"), "Shop").phase).toBe("on_the_way");
  });

  it("says why after three refusals", () => {
    const view = expressView(order({ status: "cancelled", declineCount: 3 }), "Shop");
    expect(view).toMatchObject({ phase: "cancelled", line: "No shop could take it this time.", railIndex: null });
    expect(expressView(order({ status: "cancelled" }), "Shop").line).toBe("This order was cancelled.");
  });

  it("never crashes on a status added later", () => {
    expect(expressView(order({ status: "something_new" }), null).phase).toBe("checking");
  });
});

describe("A3: pay after the shop accepts", () => {
  const now = Date.parse("2026-11-24T05:00:00.000Z");
  const a3 = (express: Partial<ExpressOrder>, state: string, initialStatus = "not_submitted") => ({
    ...order({ paymentTiming: "after_acceptance", status: "accepted", ...express }),
    state,
    payments: { initial: { amountMinor: 24_000, method: "qr_manual", status: initialStatus, reference: null, submittedAt: null, confirmedAt: null } },
  });

  it("asks for payment while the five minutes run", () => {
    const view = expressView(a3({ payBy: "2026-11-24T05:04:00.000Z" }, "awaiting_initial_payment"), "Corner Print", now);
    expect(view).toMatchObject({ phase: "pay_now", title: "Corner Print accepted", cancellable: false });
  });

  it("says the window closed instead of asking once payBy passed", () => {
    const view = expressView(a3({ payBy: "2026-11-24T04:59:59.000Z" }, "awaiting_initial_payment"), "Corner Print", now);
    expect(view.phase).toBe("pay_expired");
  });

  it("holds the price while GRIDGO checks a payment sent in time", () => {
    const view = expressView(
      a3({ payBy: "2026-11-24T05:04:00.000Z" }, "awaiting_initial_payment", "pending_confirmation"),
      "Corner Print",
      now,
    );
    expect(view.phase).toBe("accepted");
    expect(view.line).toContain("checking your payment");
    expect(view.railIndex).toBe(0);
    // The API moves a sent payment to initial_payment_review; the same card holds.
    const review = expressView(
      a3({ payBy: "2026-11-24T04:59:00.000Z" }, "initial_payment_review", "pending_confirmation"),
      "Corner Print",
      now,
    );
    expect(review.phase).toBe("accepted");
    expect(review.line).toContain("checking your payment");
  });

  it("asks again after a payment was sent back, inside the window", () => {
    const view = expressView(a3({ payBy: "2026-11-24T05:04:00.000Z" }, "awaiting_initial_payment", "rejected"), null, now);
    expect(view.phase).toBe("pay_now");
  });

  it("offers a calm re-pick when the shop declined or timed out", () => {
    const view = expressView({ ...order({ paymentTiming: "after_acceptance", status: "cancelled", repickRequired: true }), state: "cancelled" }, "Corner Print", now);
    expect(view).toMatchObject({ phase: "repick", title: "Pick another printer", railIndex: null });
    expect(view.line).toContain("Your files are kept");
  });

  it("says up front that an A3 order is paid after acceptance", () => {
    expect(expressView(order({ paymentTiming: "after_acceptance" }), null).line).toContain("You pay once the shop accepts");
  });

  it("leaves a standard document order exactly as it was", () => {
    expect(expressView({ ...order({ status: "accepted" }), state: "payment_authorized" }, "Corner Print", now).phase).toBe("accepted");
  });
});

describe("helpers", () => {
  it("counts the acceptance window down and stops at zero", () => {
    const now = Date.parse("2026-11-19T01:00:00.000Z");
    expect(acceptCountdown("2026-11-19T01:04:31.200Z", now)).toBe("4:32");
    expect(acceptCountdown("2026-11-19T00:59:00.000Z", now)).toBeNull();
    expect(acceptCountdown(null, now)).toBeNull();
  });

  it("keeps the code's leading zeroes", () => {
    expect(formatPickupCode("012345")).toBe("012 345");
    expect(formatPickupCode("12345")).toBeNull();
  });

  it("rates with one score and carries only matching tags", () => {
    expect(ratingTags(5)).toContain("Fast");
    expect(ratingTags(2)).toContain("Slow");
    expect(ratingBody(5, ["Fast", "Slow"])).toEqual({ qualityStars: 5, speedStars: 5, valueStars: 5, comment: "Tags: Fast" });
    expect(ratingBody(2, [])).toEqual({ qualityStars: 2, speedStars: 2, valueStars: 2 });
  });
});

describe("cancelledAwaitingRefund", () => {
  it("is only a paid Express order GRIDGO already cancelled", () => {
    const express = order({ status: "cancelled", refundRequired: true }).expressOrder;
    expect(cancelledAwaitingRefund({ state: "cancelled", expressOrder: express })).toBe(true);
    expect(cancelledAwaitingRefund({ state: "cancelled", expressOrder: { ...express, refundRequired: false } })).toBe(false);
    expect(cancelledAwaitingRefund({ state: "supplier_assigned", expressOrder: express })).toBe(false);
    expect(cancelledAwaitingRefund({ state: "cancelled", expressOrder: null })).toBe(false);
    expect(cancelledAwaitingRefund(null)).toBe(false);
  });
});
