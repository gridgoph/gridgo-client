/**
 * Bottom-sheet drag physics.
 *
 * Pulled out of the component so the thresholds are testable: whether a drag
 * dismisses is the whole feel of a sheet, and "it looked right" is not a check
 * anyone can repeat.
 */

/** Past this much downward drag, releasing dismisses. */
export const DISMISS_DISTANCE = 120;

/**
 * A flick this fast dismisses regardless of how far it travelled.
 *
 * `PanResponder` reports velocity in px/ms, so this is roughly 800px/s — fast
 * enough that a scroll-like flick counts and a slow considered drag does not.
 */
export const THROW_VELOCITY = 0.8;

/** Spring the sheet settles with. Firm, quick, and without a visible bounce. */
export const SHEET_SPRING = { damping: 36, stiffness: 340, mass: 0.9 } as const;

/**
 * Where the sheet should go when the finger lifts.
 *
 * Distance *or* velocity, because the two describe different intentions: a
 * deliberate drag past the halfway mark, and a quick flick that never travels
 * far. Requiring both would make the sheet feel stuck.
 */
export function shouldDismissOnRelease(offsetY: number, velocityY: number): boolean {
  return offsetY > DISMISS_DISTANCE || velocityY > THROW_VELOCITY;
}

/**
 * How far the sheet follows the finger.
 *
 * Downward is one-to-one. Upward is resisted rather than blocked, so the sheet
 * still answers the finger at its stop instead of feeling dead.
 */
export function dragOffset(startOffset: number, dy: number): number {
  const next = startOffset + dy;
  return next < 0 ? next / 4 : next;
}
