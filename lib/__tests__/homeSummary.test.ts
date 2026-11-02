import type { HomeActiveOrder, HomeSummary } from "@/lib/api";
import {
  activeOrderDetail,
  activeOrderHeadline,
  bugRewardTag,
  daysLeftLine,
  lastOrder,
  smartTileView,
} from "@/lib/homeSummary";

const NOW = Date.parse("2026-11-02T04:00:00Z");

function activeOrder(overrides: Partial<HomeActiveOrder> = {}): HomeActiveOrder {
  return {
    orderId: "ord_1",
    state: "production",
    step: 2,
    stepKey: "printing",
    stepCount: 4,
    fulfillmentMode: "delivery",
    basketId: null,
    awaitingPayment: false,
    promisedAt: "2026-11-04T09:00:00Z",
    statusAt: "2026-11-02T03:00:00Z",
    time: { kind: "promised", at: "2026-11-04T09:00:00Z" },
    ...overrides,
  };
}

function summary(overrides: Partial<HomeSummary> = {}): HomeSummary {
  return {
    serverTime: "2026-11-02T04:00:00Z",
    tile: "invite",
    missions: null,
    activeOrder: null,
    activeOrderCount: 0,
    testerVoucher: null,
    bugReport: { rewardAvailable: false, amountMinor: 1500 },
    ...overrides,
  };
}

const missions = (done: number) => ({
  eligible: true,
  label: null,
  awardedAt: null,
  missions: { added: done > 0, placed: done > 1, tracked: done > 2, received: done > 3, rated: done > 4 },
  completedCount: done,
  rewardStatus: "pending",
  reward: null,
  total: 5,
});

const voucher = {
  voucherId: "vch_1",
  kind: "mission",
  valueMinor: 1500,
  code: "A1B2C3D4",
  expiresAt: "2026-11-30T00:00:00Z",
  secondsRemaining: 1,
  daysLeft: 27,
  redeemable: true,
  reserved: false,
};

describe("smartTileView — the four states GRIDGO picks", () => {
  it("shows the missions with their count", () => {
    const view = smartTileView(summary({ tile: "missions", missions: missions(2) }), null, NOW);
    expect(view).toMatchObject({ kind: "missions", done: 2, total: 5, href: "/founding-tester" });
  });

  it("shows the active order's step, promise and how many more", () => {
    const view = smartTileView(summary({ tile: "active_order", activeOrder: activeOrder(), activeOrderCount: 3 }), null, NOW);
    expect(view).toMatchObject({ kind: "active_order", headline: "Printing", step: 2, stepCount: 4, more: 2, href: "/order/ord_1" });
    expect(view.kind === "active_order" && view.detail).toMatch(/^Ready by Wed/);
  });

  it("shows an unused tester voucher with its days left", () => {
    const view = smartTileView(summary({ tile: "tester_voucher", testerVoucher: voucher }), null, NOW);
    expect(view).toMatchObject({ kind: "tester_voucher", daysLeft: 27, href: "/founding-tester" });
    expect(view.kind === "tester_voucher" && view.amount).toContain("15");
  });

  it("sends a non-mission voucher to the wallet, not the mission screen", () => {
    const view = smartTileView(summary({ tile: "tester_voucher", testerVoucher: { ...voucher, kind: "referral" } }), null, NOW);
    expect(view).toMatchObject({ kind: "tester_voucher", href: "/vouchers" });
  });

  it("shows the invite", () => {
    expect(smartTileView(summary({ tile: "invite" }), null, NOW).kind).toBe("invite");
  });

  it("falls to the next state when the named one has nothing to show", () => {
    const view = smartTileView(summary({ tile: "missions", missions: null, activeOrder: activeOrder(), activeOrderCount: 1 }), null, NOW);
    expect(view).toMatchObject({ kind: "active_order", more: 0 });
    expect(smartTileView(summary({ tile: "active_order" }), null, NOW).kind).toBe("invite");
  });

  it("does not draw finished missions as missions", () => {
    expect(smartTileView(summary({ tile: "missions", missions: missions(5) }), null, NOW).kind).toBe("invite");
  });

  it("falls back to the account's own missions when the summary could not be read", () => {
    const view = smartTileView(null, { foundingTester: missions(1) }, NOW);
    expect(view).toMatchObject({ kind: "missions", done: 1, total: 5 });
  });

  it("never guesses an order or voucher without a summary", () => {
    expect(smartTileView(null, { foundingTester: null }, NOW).kind).not.toMatch(/active_order|tester_voucher/);
  });
});

describe("active order wording", () => {
  it.each([
    [1, "delivery", "Order placed"],
    [2, "delivery", "Printing"],
    [3, "delivery", "On the way"],
    [3, "pickup", "Ready for pickup"],
    [4, "delivery", "Delivered"],
  ])("step %i (%s) reads %s", (step, fulfillmentMode, headline) => {
    expect(activeOrderHeadline({ step, stepKey: "x", fulfillmentMode, awaitingPayment: false })).toBe(headline);
  });

  it("puts a payment the client owes first", () => {
    expect(activeOrderHeadline({ step: 2, stepKey: "printing", fulfillmentMode: "delivery", awaitingPayment: true })).toBe("Payment due");
    expect(activeOrderDetail({ awaitingPayment: true, time: null }, NOW)).toBe("Tap to pay");
  });

  it("never counts down to an arrival GRIDGO did not publish", () => {
    expect(activeOrderDetail({ awaitingPayment: false, time: null }, NOW)).toBeNull();
    expect(activeOrderDetail({ awaitingPayment: false, time: { kind: "since", at: "2026-11-02T03:00:00Z" } }, NOW)).toMatch(/^Updated /);
  });

  it("says days left in words", () => {
    expect(daysLeftLine(0)).toBe("expires today");
    expect(daysLeftLine(1)).toBe("1 day left");
    expect(daysLeftLine(9)).toBe("9 days left");
  });
});

describe("bugRewardTag", () => {
  it("tags only while GRIDGO says the reward is still available", () => {
    expect(bugRewardTag(summary({ bugReport: { rewardAvailable: true, amountMinor: 1500 } }))).toContain("15");
    expect(bugRewardTag(summary({ bugReport: { rewardAvailable: false, amountMinor: 1500 } }))).toBeNull();
    expect(bugRewardTag(null)).toBeNull();
  });
});

describe("lastOrder", () => {
  it("picks the newest placed order and skips drafts", () => {
    const orders = [
      { id: "a", state: "completed", createdAt: "2026-10-01T00:00:00Z" },
      { id: "b", state: "draft", createdAt: "2026-11-01T00:00:00Z" },
      { id: "c", state: "production", createdAt: "2026-10-20T00:00:00Z" },
    ];
    expect(lastOrder(orders)?.id).toBe("c");
    expect(lastOrder([])).toBeNull();
  });
});
