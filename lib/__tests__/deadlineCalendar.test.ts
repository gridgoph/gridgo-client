import type { DeadlineDay } from "@/lib/api";
import {
  canStep,
  chosenLabel,
  choiceLabel,
  deadlineFor,
  firstAvailable,
  SHOP_TIME_ZONE,
  monthGrid,
  monthKeyOf,
  monthName,
  nextMonthWithADay,
  openMonth,
  openingMonth,
  shiftMonth,
  shopClock,
} from "@/lib/deadlineCalendar";

const MARCH = new Date(2026, 2, 9);
const NOW = new Date(2026, 2, 9, 9, 0, 0);

const availability = (entries: Record<string, DeadlineDay["state"]>): DeadlineDay[] =>
  Object.entries(entries).map(([day, state]) => ({ day, state }));

function dayOf(days: ReturnType<typeof monthGrid>, key: string) {
  const found = days.find((day) => day.dayKey === key);
  if (!found) throw new Error(`no cell for ${key}`);
  return found;
}

describe("the month a client picks from", () => {
  const grid = (entries: Record<string, DeadlineDay["state"]> = {}) =>
    monthGrid({ month: MARCH, availability: availability(entries), now: NOW });

  it("is always six rows and starts on a Monday", () => {
    const days = grid();
    expect(days).toHaveLength(42);
    expect(new Date(`${days[0].dayKey}T00:00:00`).getDay()).toBe(1);
  });

  it("offers only the days GRIDGO said it could make", () => {
    const days = grid({
      "2026-03-10": "cannot",
      "2026-03-11": "tight",
      "2026-03-12": "open",
    });
    expect(dayOf(days, "2026-03-10").selectable).toBe(false);
    expect(dayOf(days, "2026-03-11").selectable).toBe(true);
    expect(dayOf(days, "2026-03-12").selectable).toBe(true);
  });

  it("treats a day GRIDGO never answered for as one it cannot make", () => {
    // The window is finite. Past its end the honest answer is not a guess
    // drawn as a choice.
    expect(dayOf(grid(), "2026-03-25").choice).toBe("cannot");
    expect(dayOf(grid(), "2026-03-25").selectable).toBe(false);
  });

  it("never offers a day that has gone, whatever the platform says about it", () => {
    const days = grid({ "2026-03-08": "open" });
    expect(dayOf(days, "2026-03-08").choice).toBe("past");
    expect(dayOf(days, "2026-03-08").selectable).toBe(false);
  });

  it("keeps a neighbouring month's days in the grid but out of reach", () => {
    const days = grid({ "2026-02-25": "open" });
    const february = dayOf(days, "2026-02-25");
    expect(february.inMonth).toBe(false);
    expect(february.selectable).toBe(false);
  });

  it("finds the first day a client could actually choose", () => {
    const days = grid({ "2026-03-09": "cannot", "2026-03-10": "cannot", "2026-03-11": "tight" });
    expect(firstAvailable(days)?.dayKey).toBe("2026-03-11");
    expect(firstAvailable(grid())).toBeNull();
  });
});

describe("what a day is called", () => {
  it("describes what a narrow day costs the client, never how few shops are left", () => {
    // A client is never told how many print something. "Fewer printers free"
    // would be a count by implication.
    for (const label of [choiceLabel("open"), choiceLabel("tight"), choiceLabel("cannot")]) {
      expect(label).not.toMatch(/shop|printer|press/i);
      expect(label).not.toMatch(/\d/);
    }
    expect(choiceLabel("tight")).toContain("choice");
  });
});

describe("the deadline a chosen day means", () => {
  it("is the end of the working day, not the start of it", () => {
    // Somebody picking Friday means by the end of Friday. Midnight quietly
    // asks for Thursday.
    const deadline = new Date(deadlineFor("2026-03-13"));
    expect(deadline.getHours()).toBe(18);
    expect(deadline.getDate()).toBe(13);
  });

  it("says the date back in words a person recognises", () => {
    expect(chosenLabel("2026-03-13")).toContain("March");
    expect(chosenLabel("2026-03-13")).toContain("13");
  });
});

describe("before GRIDGO has answered", () => {
  it("offers the month rather than greying all of it out", () => {
    // An empty availability list reads as "nobody prints this at all", which
    // is a worse lie than offering a date the match then refuses — a refusal
    // at least says why and names the earliest date that works.
    const optimistic = monthGrid({ month: MARCH, availability: openMonth(MARCH), now: NOW });
    expect(dayOf(optimistic, "2026-03-20").selectable).toBe(true);
    // And still never offers a day that has gone.
    expect(dayOf(optimistic, "2026-03-08").selectable).toBe(false);
  });
});

describe("which month to open on", () => {
  it("opens on the month that has something in it, not always this one", () => {
    // A job whose soonest date is next month opened on a page where every day
    // was struck through, which reads as "GRIDGO cannot print this" rather
    // than "not this month" — and gave no clue that moving forward helped.
    const spillover = availability({
      "2026-03-30": "cannot",
      "2026-03-31": "cannot",
      "2026-04-02": "open",
    });
    expect(monthKeyOf(openingMonth(spillover, NOW))).toBe("2026-04");
  });

  it("stays on this month when this month works", () => {
    const soon = availability({ "2026-03-12": "open" });
    expect(monthKeyOf(openingMonth(soon, NOW))).toBe("2026-03");
  });

  it("stays on this month when nothing works at all", () => {
    // Nowhere better to go. The month is honest about being empty and the
    // arrows say there is nothing forward either.
    expect(monthKeyOf(openingMonth([], NOW))).toBe("2026-03");
  });
});

describe("stepping between months", () => {
  const window = availability({ "2026-03-12": "open", "2026-04-20": "open" });

  it("will not go back before this month, because a past date is not a deadline", () => {
    expect(canStep(MARCH, -1, window, NOW)).toBe(false);
    expect(canStep(new Date(2026, 3, 1), -1, window, NOW)).toBe(true);
  });

  it("goes forward only as far as GRIDGO has answered for", () => {
    // Past the window a month would be struck days with nothing behind them.
    expect(canStep(MARCH, 1, window, NOW)).toBe(true);
    expect(canStep(new Date(2026, 3, 1), 1, window, NOW)).toBe(false);
  });

  it("offers no step at all before an answer arrives", () => {
    expect(canStep(MARCH, 1, [], NOW)).toBe(false);
  });

  it("steps by whole months", () => {
    expect(monthKeyOf(shiftMonth(MARCH, 1))).toBe("2026-04");
    expect(monthKeyOf(shiftMonth(MARCH, -1))).toBe("2026-02");
    expect(monthKeyOf(shiftMonth(new Date(2026, 11, 15), 1))).toBe("2027-01");
  });
});

describe("a month with nothing in it", () => {
  it("names the soonest month that has a day", () => {
    // What the captain's screenshot was really showing: a page of unavailable
    // days with no clue that moving forward would help.
    const spillover = availability({ "2026-03-20": "cannot", "2026-04-02": "open" });
    expect(monthKeyOf(nextMonthWithADay(MARCH, spillover, NOW)!)).toBe("2026-04");
    expect(monthName(new Date(2026, 3, 1))).toBe("April");
  });

  it("says nothing when the month on screen already has a day", () => {
    const here = availability({ "2026-03-12": "open", "2026-04-02": "open" });
    expect(nextMonthWithADay(MARCH, here, NOW)).toBeNull();
  });

  it("says nothing when no month in the window has one", () => {
    expect(nextMonthWithADay(MARCH, availability({ "2026-03-20": "cannot" }), NOW)).toBeNull();
    expect(nextMonthWithADay(MARCH, [], NOW)).toBeNull();
  });

  it("does not point back at a day that has gone", () => {
    // A past day is available in the answer and useless as a destination.
    const past = availability({ "2026-03-02": "open", "2026-03-20": "cannot" });
    expect(nextMonthWithADay(MARCH, past, NOW)).toBeNull();
  });
});

describe("the clock", () => {
  it("reads the time where the presses are, not where the phone is", () => {
    // A deadline is a moment in Davao. "By Friday" is exactly the kind of
    // promise that goes wrong by a day when the zones differ.
    const midnightUtc = new Date("2026-03-09T16:30:00.000Z");
    // Manila is UTC+8, so this is half past midnight the next day there.
    expect(shopClock(midnightUtc)).toMatch(/12:30/);
    expect(SHOP_TIME_ZONE).toBe("Asia/Manila");
  });
});
