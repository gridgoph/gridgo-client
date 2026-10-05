/**
 * Collecting at GRIDGO Office, in a client's words (gridgo-api#148).
 *
 * The hub's hours and its pick-up fee are Super Admin settings, read from
 * `GET /settings` (`settings.hubPickup`) or, once an order is placed, from the
 * snapshot on the order. Nothing here is a constant: the mockup's Monday,
 * Wednesday, Friday was an example, and an app that printed it would send
 * people to a locked door the week the hours change.
 *
 * `schedule: null` is a real answer — nobody has set hours yet — and is said
 * as one. It is never drawn as "open every day".
 */

import { formatPhp, type HubClosure, type HubPickup, type HubSchedule, type PlatformSettings } from "@/lib/api";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Monday first, the way a working week is read. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Said in place of hours while Super Admin has not set any. */
export const HUB_HOURS_UNSET =
  "Collection hours are not set yet. GRIDGO tells you when your order is ready to collect.";

/** The hub as the platform holds it now, or null on an API from before the setting. */
export function hubPickupOf(settings: Pick<PlatformSettings, "hubPickup"> | null | undefined): HubPickup | null {
  return settings?.hubPickup ?? null;
}

/**
 * The pick-up charge as a client reads it: "Free" at zero, never "₱0.00",
 * and nothing at all while it is unknown.
 */
export function hubFeeLabel(feeMinor: number | null | undefined): string | null {
  if (feeMinor == null || !Number.isSafeInteger(feeMinor) || feeMinor < 0) return null;
  return feeMinor === 0 ? "Free" : formatPhp(feeMinor);
}

/** "9:00 AM", "12:30 PM", "Midnight" — minutes after the hub's own midnight. */
export function clockLabel(minute: number): string {
  if (minute <= 0 || minute >= 1440) return minute === 0 ? "12:00 AM" : "Midnight";
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  const suffix = hours < 12 ? "AM" : "PM";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** Runs of neighbouring days read as a range: "Mon–Fri", and "Mon, Wed, Fri" otherwise. */
function dayList(weekdays: number[]): string {
  const positions = weekdays
    .map((day) => WEEK_ORDER.indexOf(day as (typeof WEEK_ORDER)[number]))
    .filter((position) => position >= 0)
    .sort((left, right) => left - right);
  const parts: string[] = [];
  let start = 0;
  for (let index = 1; index <= positions.length; index += 1) {
    if (index < positions.length && positions[index] === positions[index - 1] + 1) continue;
    const from = DAY_SHORT[WEEK_ORDER[positions[start]]];
    const to = DAY_SHORT[WEEK_ORDER[positions[index - 1]]];
    const span = index - start;
    if (span >= 3) parts.push(`${from}–${to}`);
    else if (span === 2) parts.push(from, to);
    else parts.push(from);
    start = index;
  }
  return parts.join(", ");
}

/**
 * The opening hours, one line per set of days that keep the same hours:
 * "Mon, Wed, Fri · 9:00 AM – 5:00 PM". Null when no hours are set, so the
 * caller says `HUB_HOURS_UNSET` rather than drawing an empty list.
 */
export function hubHoursLines(schedule: HubSchedule | null | undefined): string[] | null {
  const week = schedule?.week ?? [];
  if (!week.length) return null;
  const byDay = new Map<number, string>();
  for (const day of WEEK_ORDER) {
    const windows = week
      .filter((window) => window.weekday === day)
      .sort((left, right) => left.opensMinute - right.opensMinute)
      .map((window) => `${clockLabel(window.opensMinute)} – ${clockLabel(window.closesMinute)}`);
    if (windows.length) byDay.set(day, windows.join(", "));
  }
  const groups = new Map<string, number[]>();
  for (const [day, hours] of byDay) {
    const days = groups.get(hours) ?? [];
    days.push(day);
    groups.set(hours, days);
  }
  return [...groups.entries()].map(([hours, days]) => `${dayList(days)} · ${hours}`);
}

/** A `YYYY-MM-DD` day as a date at UTC noon, so no offset can move it a day. */
function dayAt(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function shortDay(date: Date): string {
  return `${date.getUTCDate()} ${MONTH_SHORT[date.getUTCMonth()]}`;
}

/** "Closed 12 Oct", "Closed 12–14 Oct", "Closed 30 Oct – 2 Nov". */
export function closureLine(closure: HubClosure): string | null {
  const start = dayAt(closure.startDay);
  const end = dayAt(closure.endDay);
  if (!start || !end) return null;
  if (start.getTime() === end.getTime()) return `Closed ${shortDay(start)}`;
  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    return `Closed ${start.getUTCDate()}–${shortDay(end)}`;
  }
  return `Closed ${shortDay(start)} – ${shortDay(end)}`;
}

/**
 * Closures a client could still walk into: those not yet over by the hub's
 * own calendar day, within the next `horizonDays`. A closure months away is
 * noise on a checkout sheet; one next Tuesday is the thing worth knowing.
 */
export function upcomingClosureLines(
  schedule: HubSchedule | null | undefined,
  now: Date = new Date(),
  horizonDays = 30,
): string[] {
  const closures = schedule?.closures ?? [];
  if (!closures.length) return [];
  const offset = schedule?.utcOffsetMinutes ?? 480;
  const local = new Date(now.getTime() + offset * 60_000);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 12);
  const horizon = today + horizonDays * 86_400_000;
  return closures
    .filter((closure) => {
      const start = dayAt(closure.startDay);
      const end = dayAt(closure.endDay);
      return start != null && end != null && end.getTime() >= today && start.getTime() <= horizon;
    })
    .sort((left, right) => left.startDay.localeCompare(right.startDay))
    .map(closureLine)
    .filter((line): line is string => line != null);
}

/** The weekdays (0 = Sunday) with at least one opening window. */
export function openWeekdays(schedule: HubSchedule | null | undefined): Set<number> {
  return new Set((schedule?.week ?? []).map((window) => window.weekday));
}
