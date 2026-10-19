import type { CatalogSpeedTier, DeadlineDay } from "@/lib/api";
import {
  cutoffClock,
  dayChoiceOf,
  dayReasonLine,
  dayReasonOf,
  isPossibleDay,
  monthGrid,
  nearReadyLine,
  openingMonth,
  readyByLine,
} from "@/lib/deadlineCalendar";
import { reviewHoursPhrase } from "@/lib/operatingHours";
import { rushPriceLine, schedulingChip } from "@/lib/scheduling";

// Monday 19 October 2026, 10:00 AM in Davao.
const NOW = new Date("2026-10-19T02:00:00.000Z");
const EARLIEST = "2026-10-21T07:00:00.000Z";

const TIER: CatalogSpeedTier = {
  id: "tier_rush",
  label: "Same day",
  turnaroundHours: 4,
  priceMinor: 1_500,
  surchargeMinor: null,
  clientPriceMinor: 1_545,
  clientSurchargeMinor: null,
};

describe("a day's status (gridgo-api#292)", () => {
  it.each([
    ["secured", "open"],
    ["tight", "tight"],
    ["rush", "rush"],
    ["not_possible", "cannot"],
  ] as const)("draws %s as %s", (status, choice) => {
    // The legacy `state` the API still sends beside it never wins.
    expect(dayChoiceOf({ state: "tight", status })).toBe(choice);
  });

  it("reads an older response without `status` from `state`, with no Rush", () => {
    expect(dayChoiceOf({ state: "open" })).toBe("open");
    expect(dayChoiceOf({ state: "tight" })).toBe("tight");
    expect(dayChoiceOf({ state: "cannot" })).toBe("cannot");
    expect(isPossibleDay({ state: "cannot" })).toBe(false);
  });

  it("falls back to `state` for a status this build does not know", () => {
    expect(dayChoiceOf({ state: "open", status: "something_new" })).toBe("open");
  });

  it("lets a client pick Tight, Secured and Rush days, and carries each day's ready time", () => {
    const availability: DeadlineDay[] = [
      { day: "2026-10-19", state: "tight", status: "tight", reason: null, readyBy: "2026-10-19T07:00:00.000Z", rushTier: null },
      { day: "2026-10-20", state: "open", status: "secured", reason: null, readyBy: "2026-10-20T03:00:00.000Z", rushTier: null },
      { day: "2026-10-22", state: "tight", status: "rush", reason: null, readyBy: "2026-10-22T05:00:00.000Z", rushTier: TIER },
      { day: "2026-10-25", state: "cannot", status: "not_possible", reason: "gridgo_closed_sunday", readyBy: null, rushTier: null },
    ];
    const days = monthGrid({ month: new Date(2026, 9, 1), availability, now: new Date(2026, 9, 19, 10) });
    const cell = (key: string) => days.find((day) => day.dayKey === key)!;

    expect(cell("2026-10-19")).toMatchObject({ choice: "tight", selectable: true, readyBy: "2026-10-19T07:00:00.000Z" });
    expect(cell("2026-10-20")).toMatchObject({ choice: "open", selectable: true, rushTier: null });
    expect(cell("2026-10-22")).toMatchObject({ choice: "rush", selectable: true, rushTier: TIER });
    expect(cell("2026-10-25")).toMatchObject({ choice: "cannot", selectable: false, reason: "closed_sunday", readyBy: null });
  });

  it("opens on the month of the first possible day, by status", () => {
    const availability: DeadlineDay[] = [
      { day: "2026-10-31", state: "tight", status: "not_possible", reason: "before_shortest_time" },
      { day: "2026-11-02", state: "open", status: "secured" },
    ];
    expect(openingMonth(availability, NOW).getMonth()).toBe(10);
  });
});

describe("why a day cannot be had, in plain words", () => {
  it.each([
    ["gridgo_closed_sunday", "GRIDGO is closed on Sundays."],
    ["gridgo_closed", "GRIDGO is closed this day."],
    ["outside_operating_hours", "Not today: GRIDGO is closed right now."],
    ["after_dispatch_cutoff", "Too late for today: the 4:00 PM cutoff has passed."],
    ["before_shortest_time", "Before the shop's shortest time. The earliest is Wed 21 Oct."],
    ["no_eligible_listing", "No printer on GRIDGO offers this yet, so no date can be promised."],
    [
      "review_production_delivery_exceeds_deadline",
      "Too soon. Artwork review, printing and delivery take until Wed 21 Oct.",
    ],
  ])("%s", (reason, line) => {
    expect(dayReasonLine(dayReasonOf(reason, true), EARLIEST, 960)).toBe(line);
  });

  it("still names the cutoff when GRIDGO's settings have not arrived", () => {
    expect(dayReasonLine("after_cutoff", EARLIEST, null)).toBe(
      "Too late for today: today's cutoff has passed.",
    );
  });

  it("says a day past the answered window was not checked", () => {
    expect(dayReasonOf(undefined, false)).toBe("not_checked");
  });

  it("says the cutoff as a clock", () => {
    expect(cutoffClock(960)).toBe("4:00 PM");
    expect(cutoffClock(30)).toBe("12:30 AM");
    expect(cutoffClock(720)).toBe("12:00 PM");
    expect(cutoffClock(1440)).toBeNull();
    expect(cutoffClock(undefined)).toBeNull();
  });
});

describe("same-day ready times", () => {
  it("says today and tomorrow with the Davao clock", () => {
    expect(readyByLine("2026-10-19T07:00:00.000Z", NOW)).toBe("Today, ready by 3:00 PM");
    expect(readyByLine("2026-10-20T03:00:00.000Z", NOW)).toBe("Tomorrow, ready by 11:00 AM");
    expect(readyByLine("2026-10-22T05:00:00.000Z", NOW)).toBe("Ready by Thu 22 Oct, 1:00 PM");
  });

  it("counts Davao's day, not the UTC one", () => {
    // 11:30 PM UTC on the 19th is 7:30 AM on the 20th in Davao.
    expect(nearReadyLine("2026-10-19T23:30:00.000Z", NOW)).toBe("Tomorrow, ready by 7:30 AM");
  });

  it("names only a near day, and nothing without a time", () => {
    expect(nearReadyLine("2026-10-22T05:00:00.000Z", NOW)).toBeNull();
    expect(readyByLine(null, NOW)).toBeNull();
    expect(readyByLine("not a date", NOW)).toBeNull();
  });
});

describe("GRIDGO's review hours", () => {
  it("is one phrase from the settings, and nothing without them", () => {
    const settings = {
      operatingHours: {
        timeZone: "Asia/Manila",
        artworkReviewMinutes: 60,
        schedule: {
          utcOffsetMinutes: 480,
          week: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensMinute: 480, closesMinute: 1020 })),
        },
      },
    };
    expect(reviewHoursPhrase(settings)).toBe("Mon–Sat, 8:00 AM – 5:00 PM");
    expect(reviewHoursPhrase(null)).toBeNull();
    expect(reviewHoursPhrase({})).toBeNull();
  });
});

describe("the match card's scheduling", () => {
  it("wears Tight and Rush, and nothing when Secured or absent", () => {
    expect(schedulingChip({ status: "tight" })?.label).toBe("Tight: the shop may decline");
    expect(schedulingChip({ status: "rush" })?.label).toBe("Rush, costs more");
    expect(schedulingChip({ status: "secured" })).toBeNull();
    expect(schedulingChip(null)).toBeNull();
    expect(schedulingChip(undefined)).toBeNull();
  });

  it("shows the faster speed's price only from GRIDGO's own figures", () => {
    expect(rushPriceLine(TIER, "per piece")).toBe("Rush rate ₱15.45 per piece");
    expect(
      rushPriceLine({ ...TIER, clientPriceMinor: null, priceMinor: null, surchargeMinor: 20_000, clientSurchargeMinor: 20_600 }, "per piece"),
    ).toBe("Rush adds ₱206.00");
    // A shop figure alone is the shop's price, never the client's.
    expect(rushPriceLine({ ...TIER, clientPriceMinor: undefined }, "per piece")).toBeNull();
    expect(rushPriceLine(null, "per piece")).toBeNull();
  });
});
