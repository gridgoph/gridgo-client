import type { HubSchedule } from "@/lib/api";
import {
  HUB_HOURS_UNSET,
  clockLabel,
  closureLine,
  hubFeeLabel,
  hubHoursLines,
  hubPickupOf,
  openWeekdays,
  upcomingClosureLines,
} from "@/lib/hubPickup";

const MWF: HubSchedule = {
  utcOffsetMinutes: 480,
  week: [
    { weekday: 5, opensMinute: 540, closesMinute: 1020 },
    { weekday: 1, opensMinute: 540, closesMinute: 1020 },
    { weekday: 3, opensMinute: 540, closesMinute: 1020 },
  ],
  closures: [],
};

describe("the pick-up fee", () => {
  it("reads Free at zero, never ₱0.00", () => {
    expect(hubFeeLabel(0)).toBe("Free");
  });

  it("reads the configured fee in pesos", () => {
    expect(hubFeeLabel(5000)).toBe("₱50.00");
  });

  it("says nothing while the fee is unknown", () => {
    expect(hubFeeLabel(undefined)).toBeNull();
    expect(hubFeeLabel(null)).toBeNull();
    expect(hubFeeLabel(-1)).toBeNull();
  });

  it("reads the hub from settings, and nothing from an API without it", () => {
    expect(hubPickupOf({ hubPickup: { schedule: null, feeMinor: 0 } })).toEqual({ schedule: null, feeMinor: 0 });
    expect(hubPickupOf({})).toBeNull();
  });
});

describe("the hub's hours", () => {
  it("are not invented when Super Admin has set none", () => {
    expect(hubHoursLines(null)).toBeNull();
    expect(hubHoursLines({ utcOffsetMinutes: 480, week: [] })).toBeNull();
    expect(HUB_HOURS_UNSET).toMatch(/not set yet/);
  });

  it("group the days that keep the same hours, Monday first", () => {
    expect(hubHoursLines(MWF)).toEqual(["Mon, Wed, Fri · 9:00 AM – 5:00 PM"]);
  });

  it("read a run of days as a range, and a different Saturday on its own line", () => {
    const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensMinute: 480, closesMinute: 1080 }));
    expect(
      hubHoursLines({ utcOffsetMinutes: 480, week: [...week, { weekday: 6, opensMinute: 540, closesMinute: 720 }] }),
    ).toEqual(["Mon–Fri · 8:00 AM – 6:00 PM", "Sat · 9:00 AM – 12:00 PM"]);
  });

  it("list a split day's windows in order", () => {
    expect(
      hubHoursLines({
        utcOffsetMinutes: 480,
        week: [
          { weekday: 2, opensMinute: 780, closesMinute: 1020 },
          { weekday: 2, opensMinute: 540, closesMinute: 720 },
        ],
      }),
    ).toEqual(["Tue · 9:00 AM – 12:00 PM, 1:00 PM – 5:00 PM"]);
  });

  it("name the open days for the week strip", () => {
    expect([...openWeekdays(MWF)].sort()).toEqual([1, 3, 5]);
    expect(openWeekdays(null).size).toBe(0);
  });

  it("say midnight and noon plainly", () => {
    expect(clockLabel(1440)).toBe("Midnight");
    expect(clockLabel(720)).toBe("12:00 PM");
    expect(clockLabel(0)).toBe("12:00 AM");
    expect(clockLabel(90)).toBe("1:30 AM");
  });
});

describe("closures", () => {
  it("read as a day or a span", () => {
    expect(closureLine({ startDay: "2026-10-12", endDay: "2026-10-12" })).toBe("Closed 12 Oct");
    expect(closureLine({ startDay: "2026-10-12", endDay: "2026-10-14" })).toBe("Closed 12–14 Oct");
    expect(closureLine({ startDay: "2026-10-30", endDay: "2026-11-02" })).toBe("Closed 30 Oct – 2 Nov");
  });

  it("are shown only while still ahead and within the month", () => {
    const schedule: HubSchedule = {
      ...MWF,
      closures: [
        { startDay: "2026-10-01", endDay: "2026-10-03" },
        { startDay: "2026-12-24", endDay: "2026-12-26" },
        { startDay: "2026-10-12", endDay: "2026-10-12" },
        { startDay: "2026-10-04", endDay: "2026-10-06" },
      ],
    };
    // 5 Oct, 10:00 in Davao.
    expect(upcomingClosureLines(schedule, new Date("2026-10-05T02:00:00.000Z"))).toEqual([
      "Closed 4–6 Oct",
      "Closed 12 Oct",
    ]);
  });
});
