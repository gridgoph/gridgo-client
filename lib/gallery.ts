/**
 * Paging rules for a swipeable photo gallery (the listing sheet's samples and
 * the full-screen viewer behind them), and the thumbnail strip under both.
 */

/** A thumbnail's edge, the gap between two, and the strip's end padding. */
export const THUMB_SIZE = 56;
export const THUMB_GAP = 8;
export const THUMB_STRIP_INSET = 8;

/** Keeps an index inside a gallery of `count` photos. */
export function clampPhotoIndex(index: number, count: number): number {
  if (count <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(index)));
}

/**
 * The page a horizontal scroll offset is showing. The page changes as the
 * middle of the next photo crosses the frame, so the dots follow the finger
 * rather than waiting for the swipe to settle.
 */
export function pageAtOffset(offsetX: number, pageWidth: number, count: number): number {
  if (pageWidth <= 0) return 0;
  return clampPhotoIndex(offsetX / pageWidth, count);
}

/** What a screen reader says for the gallery's position. */
export function photoPositionLabel(index: number, count: number): string {
  return `Photo ${clampPhotoIndex(index, count) + 1} of ${count}`;
}

/**
 * Where the thumbnail strip scrolls to so the current photo's thumbnail sits
 * in the middle of it — or as near as the strip's ends allow, so the first and
 * last never leave a blank run beside them. A strip that fits never scrolls.
 */
export function thumbStripOffset(index: number, count: number, viewportWidth: number): number {
  if (count <= 0 || viewportWidth <= 0) return 0;
  const content = THUMB_STRIP_INSET * 2 + count * THUMB_SIZE + (count - 1) * THUMB_GAP;
  const maxOffset = Math.max(0, content - viewportWidth);
  const centre =
    THUMB_STRIP_INSET + clampPhotoIndex(index, count) * (THUMB_SIZE + THUMB_GAP) + THUMB_SIZE / 2;
  return Math.min(maxOffset, Math.max(0, centre - viewportWidth / 2));
}

/**
 * How far the full-screen viewer's counter and close button sit from the top
 * edge. The viewer draws under the status bar (`statusBarTranslucent`), so on
 * Android the status bar's own height is a floor: a safe-area reading of 0
 * inside the Modal put "6 / 6" and the close button over the clock.
 */
export function viewerTopInset(
  safeAreaTop: number,
  platformOS: string,
  statusBarHeight: number | undefined,
): number {
  const floor = platformOS === "android" ? (statusBarHeight ?? 0) : 0;
  return Math.max(safeAreaTop, floor);
}
