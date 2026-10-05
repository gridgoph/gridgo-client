import { orderNextAction, orderStateMeta, orderWaitingOn } from "@/lib/orderState";
import {
  dateShiftLabel,
  rescheduleNextAction,
  rescheduleNotificationCopy,
  rescheduleNotificationNeedsYou,
  rescheduleView,
  timeLeftLabel,
  windowRemaining,
} from "@/lib/reschedule";
import { refundOrder } from "@/test/refundFixtures";
import { rescheduleRequest } from "@/test/shopChangeFixtures";

const asked = Date.parse("2026-10-05T09:00:00+08:00");
const HOUR = 3_600_000;

describe("rescheduleView", () => {
  it("asks for an answer inside the 24 hours", () => {
    const view = rescheduleView({ state: "production", rescheduleRequest: rescheduleRequest() }, asked + 3 * HOUR);
    expect(view).toEqual(
      expect.objectContaining({
        kind: "answer",
        proposed: "2026-10-10T17:00:00+08:00",
        original: "2026-10-07T17:00:00+08:00",
      }),
    );
  });

  it("stops offering an answer the moment the window closes, before the server sweeps", () => {
    const view = rescheduleView({ state: "production", rescheduleRequest: rescheduleRequest() }, asked + 24 * HOUR);
    expect(view?.kind).toBe("expired");
  });

  it("says the original date stands after expiry, only while the job is on the press", () => {
    const expired = rescheduleRequest({ status: "expired" });
    expect(rescheduleView({ state: "supplier_self_qc", rescheduleRequest: expired })?.kind).toBe("expired");
    expect(rescheduleView({ state: "delivered", rescheduleRequest: expired })).toBeNull();
  });

  it("has nothing to say once the new date is accepted", () => {
    expect(
      rescheduleView({ state: "production", rescheduleRequest: rescheduleRequest({ status: "accepted" }) }),
    ).toBeNull();
  });

  it("offers the other shop while its 15 minutes run, then asks to check again", () => {
    const declined = rescheduleRequest({
      status: "declined",
      resolution: "rematch_offered",
      canRequestRefund: true,
      rematch: {
        id: "rematch_1",
        promiseBy: "2026-10-08T17:00:00+08:00",
        expiresAt: "2026-10-05T12:15:00+08:00",
        sameProductAndSpecs: true,
        priceUnchanged: true,
      },
    });
    const order = { state: "production", rescheduleRequest: declined };
    expect(rescheduleView(order, asked + 3 * HOUR)).toEqual(
      expect.objectContaining({ kind: "offer", offerId: "rematch_1" }),
    );
    expect(rescheduleView(order, asked + 4 * HOUR)?.kind).toBe("offer_expired");
  });

  it("offers the refund as a last resort when no shop matches", () => {
    const view = rescheduleView({
      state: "production",
      rescheduleRequest: rescheduleRequest({ status: "declined", resolution: "no_match", canRequestRefund: true }),
    });
    expect(view?.kind).toBe("no_match");
  });

  it.each([
    rescheduleRequest({ status: "operations_required", resolution: "operations_required" }),
    rescheduleRequest({ status: "declined", resolution: "operations_required" }),
    rescheduleRequest({ status: "declined", resolution: null }),
  ])("routes Operations' cases to Operations (%#)", (request) => {
    const order = refundOrder({ rescheduleRequest: request });
    expect(rescheduleView(order)?.kind).toBe("operations");
    expect(orderNextAction(order)).toBeNull();
    expect(orderWaitingOn(order)).toMatch(/Operations will contact you/);
  });

  it.each(["rematched", "refund_requested", "resolved"])("is settled once the resolution is %s", (resolution) => {
    expect(
      rescheduleView({ state: "production", rescheduleRequest: rescheduleRequest({ status: "declined", resolution }) }),
    ).toBeNull();
  });
});

describe("the answer window", () => {
  it("counts down in hours, then minutes", () => {
    const closes = "2026-10-06T09:00:00+08:00";
    expect(timeLeftLabel(closes, asked + 3 * HOUR)).toBe("21 hours left");
    expect(timeLeftLabel(closes, asked + 22.5 * HOUR)).toBe("1 hour left");
    expect(timeLeftLabel(closes, asked + 23.5 * HOUR)).toBe("30 minutes left");
    expect(timeLeftLabel(closes, asked + 25 * HOUR)).toBe("No time left");
  });

  it("measures how much of the window is left", () => {
    expect(windowRemaining(rescheduleRequest(), asked + 6 * HOUR)).toBeCloseTo(0.75);
    expect(windowRemaining(rescheduleRequest(), asked + 30 * HOUR)).toBe(0);
  });
});

describe("dateShiftLabel", () => {
  it("says how far the date moves", () => {
    expect(dateShiftLabel("2026-10-07T17:00:00+08:00", "2026-10-10T17:00:00+08:00")).toBe("3 days later");
    expect(dateShiftLabel("2026-10-07T17:00:00+08:00", "2026-10-08T23:00:00+08:00")).toBe("1 day and 6 hours later");
    expect(dateShiftLabel("2026-10-07T17:00:00+08:00", "2026-10-07T22:00:00+08:00")).toBe("5 hours later");
  });

  it("says nothing for an earlier, equal or unknown date", () => {
    expect(dateShiftLabel("2026-10-07T17:00:00+08:00", "2026-10-06T17:00:00+08:00")).toBeNull();
    expect(dateShiftLabel(null, "2026-10-06T17:00:00+08:00")).toBeNull();
  });
});

describe("the one action", () => {
  it("asks for an answer ahead of anything else, with the time left", () => {
    const action = rescheduleNextAction(
      { state: "production", rescheduleRequest: rescheduleRequest() },
      asked + 3 * HOUR,
    );
    expect(action).toEqual(expect.objectContaining({ title: "Answer the new date request", icon: "clock" }));
    expect(action?.body).toMatch(/21 hours left/);
  });
});

describe("inbox rows", () => {
  it("replaces every shop- and ops-facing body with the client's own words", () => {
    for (const kind of [
      "requested",
      "accepted",
      "declined",
      "expired",
      "operations_required",
      "rematch_refreshed",
      "rematched",
      "refund_requested",
      "resolved",
    ]) {
      const copy = rescheduleNotificationCopy(`order_reschedule_${kind}`);
      expect(copy).not.toBeNull();
      expect(`${copy?.title} ${copy?.body}`).not.toMatch(/the client|payout|deduction/i);
    }
  });

  it("asks for the client only where there is something to choose", () => {
    expect(rescheduleNotificationNeedsYou("order_reschedule_requested")).toBe(true);
    expect(rescheduleNotificationNeedsYou("order_reschedule_declined")).toBe(true);
    expect(rescheduleNotificationNeedsYou("order_reschedule_accepted")).toBe(false);
    expect(rescheduleNotificationCopy("order_reschedule_expired")?.body).toMatch(/Operations will contact you/);
  });
});

describe("the order's chip", () => {
  it("stays on the press while a request waits for an answer, and pauses after a decline", () => {
    const pending = refundOrder({ rescheduleRequest: rescheduleRequest({ expiresAt: "2999-01-01T00:00:00Z" }) });
    expect(orderStateMeta(pending).label).toBe("In production");
    const declined = refundOrder({
      rescheduleRequest: rescheduleRequest({ status: "declined", resolution: "no_match" }),
    });
    expect(orderStateMeta(declined).label).toBe("Paused");
  });
});
