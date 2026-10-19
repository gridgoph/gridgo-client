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

import type { CatalogSpeedTier, DeadlineDay, DeadlineDayReason } from "@/lib/api";
import { MAX_LEAD_DAYS, parseDeadline } from "@/lib/deadline";
import { busiestLevel, seasonsOn, type DemandLevel, type SeasonWindow } from "@/lib/seasonWindows";

/**
 * What a day is (gridgo-api#292): `open` is Secured — a shop's ordinary time
 * meets it; `tight` is between the shop's shortest and ordinary time, so the
 * shop may decline; `rush` only a listed faster speed reaches, at its price.
 */
export type DayChoice = "cannot" | "tight" | "open" | "rush" | "past";

/**
 * Why a day in the month cannot be had. Never about shops: the reason is
 * GRIDGO's own calendar, the time the work takes, or that nothing prints this
 * yet — not how many presses are busy.
 *
 * `too_soon` is gridgo-api#203's one reason, kept for an older API.
 */
export type DayReason =
  | "closed_sunday"
  | "closed"
  | "closed_now"
  | "after_cutoff"
  | "before_shortest"
  | "too_soon"
  | "no_listing"
  | "not_checked"
  | "unavailable";

/**
 * A day inside one or more season windows.
 *
 * Drawn as a track behind the discs, so a run of season days reads as one
 * stroke across the week. `joinsPrevious` / `joinsNext` say whether the track
 * carries on into the cell beside it in the same row — a track breaks at the
 * end of a week row, and at a change of level.
 */
export type SeasonMark = {
  level: DemandLevel;
  windows: SeasonWindow[];
  joinsPrevious: boolean;
  joinsNext: boolean;
};

export type CalendarDay = {
  dayKey: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  choice: DayChoice;
  /** Whether a client may pick this day at all. Never decided by a season. */
  selectable: boolean;
  /** Why a future `cannot` day is one; null on every other day. */
  reason: DayReason | null;
  /** When the work would be ready for this day's status; null when not known. */
  readyBy: string | null;
  /** The faster speed a Rush day needs. */
  rushTier: CatalogSpeedTier | null;
  /** The season windows over this day, or null outside every season. */
  season: SeasonMark | null;
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
  seasons = [],
}: {
  month: Date;
  availability: DeadlineDay[];
  now?: Date;
  /** Season windows to shade. Awareness only: they never touch `selectable`. */
  seasons?: SeasonWindow[];
}): CalendarDay[] {
  const states = new Map(availability.map((entry) => [entry.day, entry]));
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
      dayKey < todayKey ? "past" : known === undefined ? "cannot" : dayChoiceOf(known);
    const live = choice !== "past" && choice !== "cannot";

    cells.push({
      dayKey,
      day: date.getDate(),
      inMonth,
      isToday: dayKey === todayKey,
      choice,
      selectable: inMonth && live,
      reason: choice === "cannot" ? dayReasonOf(known?.reason, known !== undefined) : null,
      readyBy: live ? (known?.readyBy ?? null) : null,
      rushTier: choice === "rush" ? (known?.rushTier ?? null) : null,
      season: null,
    });
  }
  return seasons.length ? withSeasons(cells, seasons) : cells;
}

/** The grid with each cell's season mark, joined along the week row. */
function withSeasons(cells: CalendarDay[], seasons: SeasonWindow[]): CalendarDay[] {
  const levels = cells.map((cell) => {
    const windows = seasonsOn(cell.dayKey, seasons);
    return { windows, level: busiestLevel(windows) };
  });
  return cells.map((cell, index) => {
    const { windows, level } = levels[index];
    if (!level) return cell;
    const column = index % 7;
    return {
      ...cell,
      season: {
        level,
        windows,
        joinsPrevious: column > 0 && levels[index - 1].level === level,
        joinsNext: column < 6 && levels[index + 1].level === level,
      },
    };
  });
}

/**
 * A day's answer as the calendar draws it. `status` when GRIDGO sent one
 * (gridgo-api#292); an older API's `state` otherwise, which has no Rush.
 * An unknown status is read from `state`, never guessed.
 */
export function dayChoiceOf(entry: Pick<DeadlineDay, "state" | "status">): Exclude<DayChoice, "past"> {
  switch (entry.status) {
    case "secured":
      return "open";
    case "tight":
      return "tight";
    case "rush":
      return "rush";
    case "not_possible":
      return "cannot";
    default:
      return entry.state === "open" || entry.state === "tight" ? entry.state : "cannot";
  }
}

/** Whether a client could choose this day at all. */
export function isPossibleDay(entry: Pick<DeadlineDay, "state" | "status">): boolean {
  return dayChoiceOf(entry) !== "cannot";
}

export function dayReasonOf(
  reason: DeadlineDayReason | null | undefined,
  answered: boolean,
): DayReason {
  if (!answered) return "not_checked";
  switch (reason) {
    case "gridgo_closed_sunday":
      return "closed_sunday";
    case "gridgo_closed":
      return "closed";
    case "outside_operating_hours":
      return "closed_now";
    case "after_dispatch_cutoff":
      return "after_cutoff";
    case "before_shortest_time":
      return "before_shortest";
    case "review_production_delivery_exceeds_deadline":
      return "too_soon";
    case "no_eligible_listing":
      return "no_listing";
    default:
      return "unavailable";
  }
}

/** "4:00 PM" — minutes after Davao midnight, as a clock. */
export function cutoffClock(minute: number | null | undefined): string | null {
  if (minute == null || !Number.isInteger(minute) || minute < 0 || minute > 1439) return null;
  const hours = Math.floor(minute / 60);
  const minutes = String(minute % 60).padStart(2, "0");
  const suffix = hours < 12 ? "AM" : "PM";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${suffix}`;
}

/**
 * The reason, said when a client taps a day they cannot have. A grey disc on
 * its own reads as "broken"; a sentence turns it into a plan.
 *
 * `cutoffMinute` is GRIDGO's dispatch cutoff from `GET /settings`; without it
 * the cutoff is still named, just not its time.
 */
export function dayReasonLine(
  reason: DayReason,
  earliest: string | null,
  cutoffMinute?: number | null,
): string {
  switch (reason) {
    case "closed_sunday":
      return "GRIDGO is closed on Sundays.";
    case "closed":
      return "GRIDGO is closed this day.";
    case "closed_now":
      return "Not today: GRIDGO is closed right now.";
    case "after_cutoff": {
      const clock = cutoffClock(cutoffMinute);
      return clock
        ? `Too late for today: the ${clock} cutoff has passed.`
        : "Too late for today: today's cutoff has passed.";
    }
    case "before_shortest": {
      const day = formatEarliestDay(earliest);
      return day
        ? `Before the shop's shortest time. The earliest is ${day}.`
        : "Before the shop's shortest time.";
    }
    case "too_soon": {
      const day = formatEarliestDay(earliest);
      return day
        ? `Too soon. Artwork review, printing and delivery take until ${day}.`
        : "Too soon. Artwork review, printing and delivery take longer than this.";
    }
    case "no_listing":
      return "No printer on GRIDGO offers this yet, so no date can be promised.";
    case "not_checked":
      return "Too far ahead to check yet. Pick a nearer date, or choose No rush.";
    case "unavailable":
      return "No printer can finish by this day.";
  }
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
      return "Secured";
    case "tight":
      return "Tight: the shop may decline";
    case "rush":
      return "Rush, costs more";
    case "cannot":
      return "Not possible";
    case "past":
      return "Gone";
  }
}

/** Davao's day number of an instant; Davao keeps +08:00 all year. */
function davaoDayNumber(at: number): number {
  return Math.floor((at + 8 * 3_600_000) / 86_400_000);
}

/** "3:00 PM" in Davao. */
function davaoClock(at: Date): string {
  return at.toLocaleTimeString("en-PH", {
    timeZone: SHOP_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * "Today, ready by 3:00 PM", "Tomorrow, ready by 11:00 AM", or "Ready by
 * Wed 21 Oct, 3:00 PM" — GRIDGO's ready time for a day, in Davao.
 *
 * Same-day work was a date with no time (report 45F0B547); the clock is the
 * answer a client ordering this morning actually needs. Null without one.
 */
export function readyByLine(readyBy: string | null | undefined, now: Date = new Date()): string | null {
  const at = parseDeadline(readyBy ?? null);
  if (!at) return null;
  return nearReadyLine(readyBy, now) ?? `Ready by ${formatEarliestDay(at)}, ${davaoClock(at)}`;
}

/**
 * "Today, ready by 3:00 PM" or "Tomorrow, ready by 11:00 AM"; null for any
 * other day. The match card and the order screen say a near ready time this
 * way, beside the full date they already show.
 */
export function nearReadyLine(readyBy: string | null | undefined, now: Date = new Date()): string | null {
  const at = parseDeadline(readyBy ?? null);
  if (!at) return null;
  const gap = davaoDayNumber(at.getTime()) - davaoDayNumber(now.getTime());
  if (gap === 0) return `Today, ready by ${davaoClock(at)}`;
  if (gap === 1) return `Tomorrow, ready by ${davaoClock(at)}`;
  return null;
}

/**
 * The clock, in the time the shops actually work in.
 *
 * A deadline is a moment in Davao, not on the phone. Somebody ordering from
 * abroad, or from a handset whose zone drifted, would otherwise read a date
 * this screen means differently — and "by Friday" is exactly the kind of
 * promise that goes wrong by a day.
 */
export const SHOP_TIME_ZONE = "Asia/Manila";

export function shopClock(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: SHOP_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(now);
  } catch {
    // A runtime without the zone data is not a reason to lose the screen.
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(now);
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

/**
 * The calendar day a deadline falls on, in the same clock `deadlineFor` set
 * it with — so a date already in the basket lands on the cell it came from.
 */
export function dayKeyOfDeadline(value: string | null | undefined): string | null {
  const date = parseDeadline(value ?? null);
  return date ? dayKeyOf(date) : null;
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

/** "Wed 24 Sep" — a calendar day without a clock. */
export function formatEarliestDay(value: string | Date | null | undefined): string | null {
  const date = value instanceof Date ? value : parseDeadline(value ?? null);
  if (!date) return null;
  const weekday = date.toLocaleDateString("en-PH", {
    weekday: "short",
    timeZone: SHOP_TIME_ZONE,
  });
  const day = date.toLocaleDateString("en-PH", {
    day: "numeric",
    timeZone: SHOP_TIME_ZONE,
  });
  const month = date.toLocaleDateString("en-PH", {
    month: "short",
    timeZone: SHOP_TIME_ZONE,
  });
  return `${weekday} ${day} ${month}`;
}

/**
 * The line that replaced the red discs: when this can first be ready, to the
 * minute, and when GRIDGO's own team reviews the artwork that every date
 * waits on. Or that nobody can within the window.
 *
 * `reviewHours` is "Mon–Sat, 8:00 AM – 5:00 PM" from `GET /settings`; without
 * it the hours are left out rather than invented.
 */
export function earliestReadyLine(earliest: string | null, reviewHours?: string | null): string {
  const at = parseDeadline(earliest);
  if (!at) {
    return `No printer can make this within the next ${MAX_LEAD_DAYS} days. Try No rush to see anyone.`;
  }
  const line = `Earliest ready: ${formatEarliestDay(at)}, ${davaoClock(at)}.`;
  return reviewHours ? `${line} Our team reviews artwork ${reviewHours}.` : line;
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
  const first = availability.find(isPossibleDay);
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


/**
 * The soonest month that has a day in it, when the one on screen has none.
 *
 * A month of quiet grey is honest but unhelpful on its own: it says "not
 * these days" without saying where to look. Null when the month on screen
 * already has something, or when nothing in the answered window does.
 */
export function nextMonthWithADay(
  month: Date,
  availability: DeadlineDay[],
  now: Date = new Date(),
): Date | null {
  const shown = monthKeyOf(month);
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const usable = availability.filter((entry) => isPossibleDay(entry) && entry.day >= todayKey);
  if (usable.some((entry) => entry.day.slice(0, 7) === shown)) return null;

  const later = usable.find((entry) => entry.day.slice(0, 7) > shown);
  if (!later) return null;
  const [year, monthNumber] = later.day.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1);
}

/** "September" — a month named for a control that jumps to it. */
export function monthName(month: Date): string {
  return month.toLocaleDateString(undefined, { month: "long" });
}
