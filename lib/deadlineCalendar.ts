/**
 * The month a client picks a date from.
 *
 * The same grid a shop reads its queue in, asking the client's question
 * instead: not "how full is this day" but "can GRIDGO make it". The answer
 * comes from the platform, because the queues and capacities behind it are the
 * shops' own and a client never sees them.
 *
 * A day is a choice or it is not. Nothing here counts shops, ranks them or
 * hints at who is behind a date — the same rule the match card follows.
 */

import type { DeadlineDay } from "@/lib/api";

export type DayChoice = "cannot" | "tight" | "open" | "past";

export type CalendarDay = {
  dayKey: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  choice: DayChoice;
  /** Whether a client may pick this day at all. */
  selectable: boolean;
};

function dayKeyOf(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Sunday-first index remapped to a Monday-first week. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Every cell of a month, Monday first.
 *
 * Six rows always, so the grid does not resize between months and the page
 * under it does not jump. Neighbouring months' days stay drawn but quiet: a
 * grid that starts mid-row loses the column its weekday header names.
 */
export function monthGrid({
  month,
  availability,
  now = new Date(),
}: {
  month: Date;
  availability: DeadlineDay[];
  now?: Date;
}): CalendarDay[] {
  const states = new Map(availability.map((entry) => [entry.day, entry.state]));
  const todayKey = dayKeyOf(now);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - mondayIndex(first));

  const cells: CalendarDay[] = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    const dayKey = dayKeyOf(date);
    const inMonth = date.getMonth() === first.getMonth();

    // A day GRIDGO has not answered for is not a day to offer. The window is
    // finite, and past its end the honest answer is "ask nearer the time"
    // rather than a guess drawn as a choice.
    const known = states.get(dayKey);
    const choice: DayChoice =
      dayKey < todayKey ? "past" : known === undefined ? "cannot" : known;

    cells.push({
      dayKey,
      day: date.getDate(),
      inMonth,
      isToday: dayKey === todayKey,
      choice,
      selectable: inMonth && (choice === "open" || choice === "tight"),
    });
  }
  return cells;
}

/**
 * What a day means, in the client's terms.
 *
 * Never about shops. "Fewer printers free" would be a count by implication,
 * and the platform's rule is that a client is not told how many print
 * something — so a narrow day is described by what it costs them, which is
 * choice, not by how few are left.
 */
export function choiceLabel(choice: DayChoice): string {
  switch (choice) {
    case "open":
      return "We can make this";
    case "tight":
      return "Tight — less choice";
    case "cannot":
      return "Too soon for this job";
    case "past":
      return "Gone";
  }
}

/** The first day a client could actually choose, or null when there is none. */
export function firstAvailable(days: CalendarDay[]): CalendarDay | null {
  return days.find((day) => day.selectable) ?? null;
}

/**
 * The deadline a chosen day means, as an instant.
 *
 * End of the working day rather than midnight. A client who picks Friday means
 * "by the end of Friday", and a deadline at 00:00 quietly asks for Thursday.
 */
export function deadlineFor(dayKey: string): string {
  const date = new Date(`${dayKey}T18:00:00`);
  return date.toISOString();
}

/** "Friday 12 September" — the date said back once it is chosen. */
export function chosenLabel(dayKey: string): string {
  const date = new Date(`${dayKey}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}


/**
 * Every future day of a month offered, for when GRIDGO has not answered yet.
 *
 * The optimistic fallback. An empty availability list reads as "nobody prints
 * this at all" and greys out the whole month, which is a worse lie than
 * offering a date the match then refuses — a refusal at least says why and
 * names the earliest date that works.
 */
export function openMonth(month: Date, days = 42): DeadlineDay[] {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const out: DeadlineDay[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    out.push({ day: dayKeyOf(date), state: "open" });
  }
  return out;
}


/** A month key, `YYYY-MM`, for stepping between months. */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The month `step` months from this one. */
export function shiftMonth(month: Date, step: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + step, 1);
}

/**
 * The month worth opening on.
 *
 * Not always this one. A job whose soonest possible date is next month opens
 * on a page where every day is struck through, which reads as "GRIDGO cannot
 * print this" rather than "not this month" — and offers no clue that moving
 * forward would help.
 */
export function openingMonth(availability: DeadlineDay[], now: Date = new Date()): Date {
  const first = availability.find((entry) => entry.state !== "cannot");
  if (!first) return new Date(now.getFullYear(), now.getMonth(), 1);
  const [year, month] = first.day.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

/**
 * Whether stepping to a month is worth offering.
 *
 * Backwards stops at the current month, because a date in the past is not a
 * deadline. Forwards stops at the end of what GRIDGO has answered for: past
 * that the page would be a month of struck days with nothing behind them.
 */
export function canStep(
  month: Date,
  step: number,
  availability: DeadlineDay[],
  now: Date = new Date(),
): boolean {
  const target = shiftMonth(month, step);
  if (step < 0) return monthKeyOf(target) >= monthKeyOf(now);
  const last = availability.at(-1);
  return last ? monthKeyOf(target) <= last.day.slice(0, 7) : false;
}
