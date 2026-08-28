/**
 * Swipe-to-remove physics for a basket row.
 *
 * Out of the component for the same reason the sheet's are (`lib/sheet.ts`):
 * where a destructive gesture commits is the whole feel of it, and "it felt
 * about right" is not a check anyone can repeat.
 *
 * Two deliberate asymmetries. A flick *opens* the row rather than deleting it —
 * removing something on a fast gesture is how a basket loses an item nobody
 * meant to lose — so only a long, considered drag reaches `commit`, and even
 * that only asks the question. And the row resists being dragged the wrong way
 * instead of refusing, so it still answers the finger at its stop.
 */

/** How much of the Remove action shows when the row rests open. */
export const REVEAL_WIDTH = 104;

/** Past this much leftward travel, releasing leaves the row open. */
export const REVEAL_DISTANCE = 36;

/** Past this much, releasing asks to remove straight away. */
export const COMMIT_DISTANCE = 208;

/** A flick this fast opens the row. `PanResponder` reports px/ms. */
export const FLICK_VELOCITY = 0.5;

/** Spring the row settles with. Firm and quick, with no visible bounce. */
export const ROW_SPRING = { damping: 34, stiffness: 320, mass: 0.9 } as const;

/** Only a mostly-sideways drag is a swipe; anything else belongs to the scroll. */
export function isHorizontalSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

/**
 * How far the row follows the finger. Negative is open.
 *
 * Leftward is one-to-one all the way to the commit distance. Rightward past
 * closed is resisted rather than blocked.
 */
export function swipeOffset(startOffset: number, dx: number): number {
  const next = startOffset + dx;
  return next > 0 ? next / 4 : next;
}

export type SwipeRelease = "closed" | "open" | "commit";

/** Where the row should go when the finger lifts. */
export function swipeRelease(offset: number, velocityX: number): SwipeRelease {
  if (offset <= -COMMIT_DISTANCE) return "commit";
  if (velocityX < -FLICK_VELOCITY) return "open";
  if (offset <= -REVEAL_DISTANCE) return "open";
  return "closed";
}

/** Where the row rests in each state. */
export function restingOffset(release: SwipeRelease): number {
  return release === "open" ? -REVEAL_WIDTH : 0;
}
