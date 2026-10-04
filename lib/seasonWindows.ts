/**
 * Season windows: the stretches of the year when print shops fill up early.
 *
 * Super Admin writes them (name, inclusive dates, a demand level and a short
 * message) and gridgo-api publishes them at `GET /season-windows`
 * (`docs/SEASON_WINDOWS_API.md`). They are **awareness only**: nothing here may
 * make a date unbookable, change availability, or move a price. A client is
 * told that late March is graduation season; they can still pick it.
 *
 * Dates are `YYYY-MM-DD` calendar days in Davao time and compare as strings,
 * so no `Date` is built from them except to word them.
 */

import { SHOP_TIME_ZONE } from "@/lib/deadlineCalendar";

export type DemandLevel = "Normal" | "Busy" | "Peak";

export type SeasonWindow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  demandLevel: DemandLevel;
  message: string;
  /** The six-to-four-week heads-up interval, inclusive, as the server computed it. */
  banner: { startDate: string; endDate: string };
};

export type SeasonWindows = {
  windows: SeasonWindow[];
  banners: SeasonWindow[];
};

export const EMPTY_SEASONS: SeasonWindows = { windows: [], banners: [] };

/** The banner opens 42 days before a season and closes 28 days before it. */
export const BANNER_OPENS_DAYS_BEFORE = 42;
export const BANNER_CLOSES_DAYS_BEFORE = 28;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const LEVEL_RANK: Record<DemandLevel, number> = { Normal: 0, Busy: 1, Peak: 2 };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dayKey(value: unknown): string | null {
  const key = text(value);
  return key && DAY_KEY.test(key) ? key : null;
}

function level(value: unknown): DemandLevel {
  // The contract names exactly three. A level this build has never heard of
  // is still a season worth showing, so it reads as the quietest one rather
  // than dropping the window.
  return value === "Busy" || value === "Peak" ? value : "Normal";
}

/** `YYYY-MM-DD` shifted by whole days, on the calendar rather than the clock. */
export function addDays(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** The heads-up interval for a season starting on `startDate`. */
export function bannerInterval(startDate: string): { startDate: string; endDate: string } {
  return {
    startDate: addDays(startDate, -BANNER_OPENS_DAYS_BEFORE),
    endDate: addDays(startDate, -BANNER_CLOSES_DAYS_BEFORE),
  };
}

function readWindow(raw: unknown): SeasonWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const id = text(source.id);
  const name = text(source.name);
  const startDate = dayKey(source.startDate);
  const endDate = dayKey(source.endDate);
  if (!id || !name || !startDate || !endDate || endDate < startDate) return null;
  const banner = source.banner as Record<string, unknown> | null | undefined;
  const bannerStart = dayKey(banner?.startDate);
  const bannerEnd = dayKey(banner?.endDate);
  return {
    id,
    name,
    startDate,
    endDate,
    demandLevel: level(source.demandLevel),
    message: text(source.message) ?? "",
    banner:
      bannerStart && bannerEnd
        ? { startDate: bannerStart, endDate: bannerEnd }
        : bannerInterval(startDate),
  };
}

/**
 * The public answer, read forgivingly.
 *
 * A malformed window is dropped rather than failing the read: these are a
 * heads-up, and one bad row must not take the others off the calendar.
 */
export function parseSeasonWindows(raw: unknown): SeasonWindows {
  if (!raw || typeof raw !== "object") return EMPTY_SEASONS;
  const source = raw as Record<string, unknown>;
  const read = (list: unknown) =>
    Array.isArray(list)
      ? list.map(readWindow).filter((entry): entry is SeasonWindow => entry !== null)
      : [];
  return { windows: read(source.windows), banners: read(source.banners) };
}

/** Today in Davao, `YYYY-MM-DD` — the day the server's banner rule is counted in. */
export function davaoToday(now: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: SHOP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    const shifted = new Date(now.getTime() + 8 * 3_600_000);
    return shifted.toISOString().slice(0, 10);
  }
}

/** Every window that covers a day, inclusive at both ends. */
export function seasonsOn(key: string, windows: SeasonWindow[]): SeasonWindow[] {
  return windows.filter((window) => window.startDate <= key && key <= window.endDate);
}

/** Overlapping windows shade a day in the busiest of their levels. */
export function busiestLevel(windows: SeasonWindow[]): DemandLevel | null {
  let found: DemandLevel | null = null;
  for (const window of windows) {
    if (found === null || LEVEL_RANK[window.demandLevel] > LEVEL_RANK[found]) {
      found = window.demandLevel;
    }
  }
  return found;
}

/** Windows that touch any day of a `YYYY-MM` month, in start order. */
export function seasonsInMonth(monthKey: string, windows: SeasonWindow[]): SeasonWindow[] {
  const first = `${monthKey}-01`;
  const last = addDays(addDays(first, 32).slice(0, 7) + "-01", -1);
  return windows
    .filter((window) => window.startDate <= last && window.endDate >= first)
    .sort((a, b) => (a.startDate === b.startDate ? a.id.localeCompare(b.id) : a.startDate < b.startDate ? -1 : 1));
}

/**
 * The Home banners to draw today.
 *
 * Read from the server's `banners`, then checked again against today on the
 * phone: the answer may have been read yesterday, and a banner past its last
 * day must go even if nobody re-asked. Dismissed windows stay dismissed.
 */
export function bannersToShow(
  seasons: SeasonWindows,
  dismissed: readonly string[],
  today: string,
): SeasonWindow[] {
  const hidden = new Set(dismissed);
  return seasons.banners.filter(
    (window) =>
      !hidden.has(window.id) &&
      window.banner.startDate <= today &&
      today <= window.banner.endDate,
  );
}

/** "Fri 13 Nov" — a season day, worded without a clock. */
export function seasonDay(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "13–30 Nov", "28 Mar – 5 Apr" — a window's dates on one line. */
export function seasonRange(window: Pick<SeasonWindow, "startDate" | "endDate">): string {
  const [sy, sm, sd] = window.startDate.split("-").map(Number);
  const [ey, em, ed] = window.endDate.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const month = (date: Date) => date.toLocaleDateString("en-PH", { month: "short" });
  if (window.startDate === window.endDate) return `${sd} ${month(start)}`;
  if (sy === ey && sm === em) return `${sd}–${ed} ${month(end)}`;
  const year = sy === ey ? "" : ` ${ey}`;
  return `${sd} ${month(start)} – ${ed} ${month(end)}${year}`;
}

/** The tag a level carries wherever its colour appears. */
export function levelLabel(level: DemandLevel): string {
  switch (level) {
    case "Peak":
      return "Peak";
    case "Busy":
      return "Busy";
    case "Normal":
      return "Normal";
  }
}

/** The Home banner's headline: when the season starts, counted from today. */
export function bannerHeadline(window: SeasonWindow, today: string): string {
  const days = daysBetween(today, window.startDate);
  if (days <= 0) return `${window.name} has started`;
  if (days === 1) return `${window.name} starts tomorrow`;
  if (days % 7 === 0) return `${window.name} starts in ${days / 7} weeks`;
  return `${window.name} starts in ${days} days`;
}

/** What a calendar day says aloud about the seasons it sits in. */
export function seasonAccessibilityText(windows: SeasonWindow[]): string | null {
  if (!windows.length) return null;
  return windows.map((window) => `${levelLabel(window.demandLevel)} season, ${window.name}`).join("; ");
}

/** The one line under the season list that says what a season does not do. */
export const SEASON_AWARENESS_NOTE = "Seasons are a heads-up. Every open date can still be booked.";
