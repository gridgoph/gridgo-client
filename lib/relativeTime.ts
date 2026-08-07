/**
 * Relative timestamps for notifications and tracking "last updated".
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Format `at` relative to `now` (both epoch ms or ISO strings).
 * Examples: "Just now", "3 min ago", "2h ago", "Yesterday", "12 Aug".
 */
export function formatRelativeTime(
  at: string | number | Date,
  now: Date | number = Date.now(),
): string {
  const thenMs = typeof at === "number" ? at : new Date(at).getTime();
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (!Number.isFinite(thenMs)) return "—";

  const delta = nowMs - thenMs;
  if (delta < 0) return "Just now";
  if (delta < MINUTE) return "Just now";
  if (delta < HOUR) {
    const m = Math.floor(delta / MINUTE);
    return `${m} min ago`;
  }
  if (delta < DAY) {
    const h = Math.floor(delta / HOUR);
    return `${h}h ago`;
  }
  if (delta < 2 * DAY) return "Yesterday";

  const d = new Date(thenMs);
  return d.toLocaleDateString("en-PH", { day: "numeric", month: "short" });
}

/** Location is stale when last ping is older than this (ms). */
export const STALE_LOCATION_MS = 3 * MINUTE;

export function isLocationStale(
  lastUpdatedAt: string | number | Date | null | undefined,
  now: Date | number = Date.now(),
): boolean {
  if (lastUpdatedAt == null) return true;
  const thenMs =
    typeof lastUpdatedAt === "number" ? lastUpdatedAt : new Date(lastUpdatedAt).getTime();
  if (!Number.isFinite(thenMs)) return true;
  const nowMs = typeof now === "number" ? now : now.getTime();
  return nowMs - thenMs > STALE_LOCATION_MS;
}
