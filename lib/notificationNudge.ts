import type { Notification } from "@/lib/api";

/**
 * When the bell rings (#230).
 *
 * A notification used to arrive and vanish: a foreground push shows nothing
 * (the list already carries it), so the only sign of an update was a number
 * changing on a tab the client might not be looking at. Now each new update
 * swings the bell and plays a short chime, once, on whatever screen is open.
 *
 * "New" is measured against what this phone has already seen **since the app
 * last came to the front**, never against a clock. The first read after launch
 * or a resume only sets the baseline: whatever arrived while the app was
 * closed already reached the phone as a push, with the system's own sound, and
 * chiming for it again on the way in is the same news twice. Server and phone
 * clocks disagree too often to compare `createdAt` with "now".
 */

/**
 * Unread rows the baseline has not seen. Empty while there is no baseline
 * (`seen === null`), so the read that sets it never rings.
 */
export function freshUnread(
  seen: readonly string[] | null,
  items: readonly Notification[],
  isRead: (notification: Notification) => boolean,
): Notification[] {
  if (!seen) return [];
  const known = new Set(seen);
  return items.filter((item) => !known.has(item.id) && !isRead(item));
}

/** The baseline after a read: everything seen before, and everything now. */
export function nextBaseline(
  seen: readonly string[] | null,
  items: readonly Notification[],
): string[] {
  const ids = new Set(seen ?? []);
  for (const item of items) ids.add(item.id);
  return [...ids];
}

/**
 * Sound only for a client who has not muted it, and only while the app is on
 * screen. A background refresh is not "while the app is open", and the push
 * that woke it has already made its own sound.
 */
export function shouldChime({
  muted,
  appState,
  hushed = false,
}: {
  muted: boolean;
  appState: string | null | undefined;
  /** A louder moment owns the sound right now — the receipt's print (#229). */
  hushed?: boolean;
}): boolean {
  if (muted || hushed) return false;
  return appState === "active" || appState == null;
}

/**
 * What a screen reader hears in place of the swing and the chime. Motion and
 * sound never carry the news alone.
 */
export function nudgeAnnouncement(fresh: readonly Pick<Notification, "title">[]): string {
  if (fresh.length === 1) return `New update: ${fresh[0].title}`;
  return `${fresh.length} new updates`;
}

/** The control's whole name, count included, wherever the bell is drawn. */
export function bellLabel(unread: number): string {
  if (unread <= 0) return "Notifications";
  return unread === 1 ? "Notifications, 1 unread" : `Notifications, ${unread} unread`;
}

/**
 * The swing, in degrees, one beat at a time: a bell struck once and settling
 * from its crown. Each beat is smaller than the one before it, so it reads as
 * one strike rather than a shake.
 */
export const BELL_SWING_DEGREES = [16, -12, 8, -5, 2, 0] as const;
/**
 * How long after one nudge the next stays quiet. GRIDGO often writes a job's
 * rows seconds apart (a payment confirmed, then the job released), and they
 * reach the phone as separate reads; two chimes 0.7 s apart read as a stutter,
 * not as two pieces of news. The count still rises for every one.
 */
export const NUDGE_QUIET_MS = 4000;

/** One beat. Six of them is under three quarters of a second. */
export const BELL_SWING_BEAT_MS = 110;
