/**
 * Swipe physics for the app's two swipeable rows: a basket line (swipe to
 * remove) and an inbox card (swipe to mark read).
 *
 * Out of the components for the same reason the sheet's are (`lib/sheet.ts`):
 * where a destructive gesture commits is the whole feel of it, and "it felt
 * about right" is not a check anyone can repeat. Every function is a worklet,
 * because the rows track the finger on the UI thread
 * (`react-native-gesture-handler`), and the same functions run there and here.
 *
 * Two deliberate asymmetries on the basket row. A flick *opens* the row rather
 * than deleting it — removing something on a fast gesture is how a basket
 * loses an item nobody meant to lose — so only a long, considered drag reaches
 * `commit`, and even that only asks the question. And the row resists being
 * dragged the wrong way instead of refusing, so it still answers the finger at
 * its stop.
 */

/**
 * Sideways travel, in points, before a row takes the touch.
 *
 * Small, so the row answers the thumb at once. On iOS it is also a race: the
 * list's own scroll recognizer starts at about 10pt in any direction, so a
 * row that waits longer than that has already lost the touch to the scroll.
 */
export const SWIPE_ACTIVE_OFFSET_X = 8;

/**
 * Vertical travel, in points, that hands the touch back to the list before
 * the row has taken it. Larger than the sideways claim, so a slightly
 * diagonal thumb still swipes, and small enough that a scroll stays a scroll.
 */
export const SWIPE_FAIL_OFFSET_Y = 14;

/** How much of the Remove action shows when the row rests open. */
export const REVEAL_WIDTH = 104;

/** Past this much leftward travel, releasing leaves the row open. */
export const REVEAL_DISTANCE = 36;

/** Past this much, releasing asks to remove straight away. */
export const COMMIT_DISTANCE = 208;

/** A flick this fast opens the row. Gesture-handler reports points per second. */
export const FLICK_VELOCITY = 500;

/** Spring both rows settle with. Firm and quick, with no visible bounce. */
export const ROW_SPRING = { damping: 34, stiffness: 320, mass: 0.9 } as const;

/** Reduced motion: the row still moves to where it rests, without a spring. */
export const ROW_SETTLE_MS = 160;

/** Past this much of a drag, letting go of an inbox card marks it read. */
export const MARK_READ_DISTANCE = 96;

/**
 * How far the basket row follows the finger. Negative is open.
 *
 * Leftward is one-to-one all the way to the commit distance. Rightward past
 * closed is resisted rather than blocked.
 */
export function swipeOffset(startOffset: number, dx: number): number {
  "worklet";
  const next = startOffset + dx;
  return next > 0 ? next / 4 : next;
}

export type SwipeRelease = "closed" | "open" | "commit";

/** Where the basket row should go when the finger lifts. */
export function swipeRelease(offset: number, velocityX: number): SwipeRelease {
  "worklet";
  if (offset <= -COMMIT_DISTANCE) return "commit";
  if (velocityX < -FLICK_VELOCITY) return "open";
  if (offset <= -REVEAL_DISTANCE) return "open";
  return "closed";
}

/** Where the basket row rests in each state. */
export function restingOffset(release: SwipeRelease): number {
  "worklet";
  return release === "open" ? -REVEAL_WIDTH : 0;
}

/**
 * How far an inbox card follows the finger: left only. Dragging right does
 * nothing, so the card cannot be left hanging in a state that means nothing.
 */
export function markReadOffset(dx: number): number {
  "worklet";
  return Math.min(0, dx);
}

/** Whether letting go here marks the card read. It always springs back. */
export function marksRead(offset: number): boolean {
  "worklet";
  return offset <= -MARK_READ_DISTANCE;
}
