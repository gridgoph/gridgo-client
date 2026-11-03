import type { HubSchedule } from "@/lib/api";
import { quickActions, supportHoursLine, type QuickActionsInput } from "@/lib/quickActions";

const base: QuickActionsInput = {
  startHref: "/request/category",
  chatUnread: 0,
  supportLine: "Support",
  activeOrderId: null,
  reorderTitle: null,
  bugReward: null,
  missions: null,
};

const byKey = (input: Partial<QuickActionsInput>) =>
  Object.fromEntries(quickActions({ ...base, ...input }).map((action) => [action.key, action]));

describe("quickActions", () => {
  it("lists the actions in the sheet's order", () => {
    expect(quickActions(base).map((a) => a.key)).toEqual(["start", "chat", "track", "reorder", "quote", "report"]);
  });

  it("keeps an unusable action on the list, disabled with its reason", () => {
    const actions = byKey({});
    expect(actions.track.disabledReason).toBe("No order in progress");
    expect(actions.reorder.disabledReason).toBe("No past print yet");
  });

  it("enables Track and Reorder when there is something to act on", () => {
    const actions = byKey({ activeOrderId: "ord_1", reorderTitle: "Business cards" });
    expect(actions.track).toMatchObject({ disabledReason: null, href: "/order/ord_1" });
    expect(actions.reorder).toMatchObject({ disabledReason: null, detail: "Business cards" });
  });

  it("counts unread support replies, capped at 9+", () => {
    expect(byKey({ chatUnread: 0 }).chat.badge).toBeNull();
    expect(byKey({ chatUnread: 2 }).chat.badge).toBe("2 new");
    expect(byKey({ chatUnread: 14 }).chat.badge).toBe("9+ new");
  });

  it("chat is GRIDGO's own support, never a shop", () => {
    expect(byKey({}).chat).toMatchObject({ title: "Chat with GRIDGO", href: "/chat" });
  });

  it("tags Report a problem only while the reward is available", () => {
    expect(byKey({}).report.tag).toBeNull();
    expect(byKey({ bugReward: "₱15" }).report.tag).toBe("+₱15 TESTER");
  });

  it("adds the mission row only for a tester", () => {
    expect(byKey({}).missions).toBeUndefined();
    expect(byKey({ missions: { done: 2, total: 5 } }).missions).toMatchObject({ detail: "2 / 5", href: "/founding-tester" });
  });
});

describe("supportHoursLine", () => {
  // Mon–Sat 8:00 AM – 5:00 PM, Manila (UTC+8).
  const schedule = {
    utcOffsetMinutes: 480,
    week: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensMinute: 480, closesMinute: 1020 })),
  } as unknown as HubSchedule;
  const manila = (iso: string) => Date.parse(`${iso}+08:00`);

  it("says when support closes while it is open", () => {
    expect(supportHoursLine(schedule, manila("2026-11-02T10:00:00"))).toBe("Support · open until 5:00 PM");
  });

  it("says when replies resume later today", () => {
    expect(supportHoursLine(schedule, manila("2026-11-02T06:00:00"))).toBe("Closed · replies from 8:00 AM");
  });

  it("says tomorrow after closing", () => {
    expect(supportHoursLine(schedule, manila("2026-11-02T19:00:00"))).toBe("Closed · replies from 8:00 AM tomorrow");
  });

  it("names the weekday across a closed Sunday", () => {
    expect(supportHoursLine(schedule, manila("2026-11-07T19:00:00"))).toBe("Closed · replies from 8:00 AM Mon");
  });

  it("invents no hours GRIDGO has not set", () => {
    expect(supportHoursLine(null)).toBe("Support");
  });
});
