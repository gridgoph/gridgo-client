/**
 * Deadline handling for the print request.
 *
 * The order stores an ISO instant. The client never types one: the screen
 * uses a real date and time picker, and these helpers own the bounds and the
 * words so validation and display cannot drift apart.
 */

/** Shortest lead time Operations will accept for a new job, in hours. */
export const MIN_LEAD_HOURS = 24;

/** How far ahead a client may schedule, in days. */
export const MAX_LEAD_DAYS = 120;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Earliest deadline a client may pick. */
export function earliestDeadline(now: Date | number = Date.now()): Date {
  const nowMs = typeof now === "number" ? now : now.getTime();
  return new Date(nowMs + MIN_LEAD_HOURS * HOUR_MS);
}

/** Latest deadline a client may pick. */
export function latestDeadline(now: Date | number = Date.now()): Date {
  const nowMs = typeof now === "number" ? now : now.getTime();
  return new Date(nowMs + MAX_LEAD_DAYS * DAY_MS);
}

/**
 * Sensible first suggestion when a client opens the picker: three days out at
 * 10:00, so the wheel does not start on an instant they cannot choose.
 */
export function suggestedDeadline(now: Date | number = Date.now()): Date {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const date = new Date(nowMs + 3 * DAY_MS);
  date.setHours(10, 0, 0, 0);
  if (date.getTime() < earliestDeadline(nowMs).getTime()) {
    return earliestDeadline(nowMs);
  }
  return date;
}

/** Parse a stored deadline. Returns null for empty or unparseable values. */
export function parseDeadline(value: string | null | undefined): Date | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

/** "Sat, 15 Aug 2026 · 10:00 AM" — never a raw ISO string on screen. */
export function formatDeadline(value: string | Date | null | undefined): string {
  const date = value instanceof Date ? value : parseDeadline(value ?? null);
  if (!date) return "Not set";
  const day = date.toLocaleDateString("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}

export type DeadlineCheck = {
  ok: boolean;
  /** What is wrong and what to do about it. Null when the deadline is fine. */
  reason: string | null;
};

export function checkDeadline(
  value: string | null | undefined,
  now: Date | number = Date.now(),
): DeadlineCheck {
  const date = parseDeadline(value);
  if (!date) {
    return { ok: false, reason: "Pick a deadline so suppliers can plan production." };
  }
  const earliest = earliestDeadline(now);
  if (date.getTime() < earliest.getTime()) {
    return {
      ok: false,
      reason: `The earliest deadline is ${formatDeadline(earliest)} — printing and delivery need ${MIN_LEAD_HOURS} hours. Pick a later time.`,
    };
  }
  const latest = latestDeadline(now);
  if (date.getTime() > latest.getTime()) {
    return {
      ok: false,
      reason: `Deadlines run up to ${MAX_LEAD_DAYS} days ahead. Pick a date on or before ${formatDeadline(latest)}.`,
    };
  }
  return { ok: true, reason: null };
}

/** "in 3 days", "tomorrow", "in 6 hours" — plain lead time for the summary. */
export function describeLeadTime(
  value: string | Date | null | undefined,
  now: Date | number = Date.now(),
): string | null {
  const date = value instanceof Date ? value : parseDeadline(value ?? null);
  if (!date) return null;
  const nowMs = typeof now === "number" ? now : now.getTime();
  const delta = date.getTime() - nowMs;
  if (delta <= 0) return "in the past";
  if (delta < DAY_MS) {
    const hours = Math.max(1, Math.round(delta / HOUR_MS));
    return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const days = Math.round(delta / DAY_MS);
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
