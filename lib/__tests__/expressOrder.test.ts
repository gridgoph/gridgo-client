import type { ExpressOrder } from "@/lib/api";
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
