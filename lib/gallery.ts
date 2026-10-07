/**
 * Paging rules for a swipeable photo gallery (the listing sheet's samples and
 * the full-screen viewer behind them).
 *
 * A listing carries at most eight sample photos (gridgo-api refuses a ninth
 * with `catalog_photo_limit`), so dots always fit a phone. The counter is the
 * fallback for anything longer, rather than a row of dots that runs off the
 * edge.
 */

/** Past this many photos the dots become a "3 of 12" counter. */
export const GALLERY_MAX_DOTS = 8;

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

/** How the position is drawn: nothing for one photo, dots, or a counter. */
export function galleryIndicator(count: number): "none" | "dots" | "counter" {
  if (count <= 1) return "none";
  return count <= GALLERY_MAX_DOTS ? "dots" : "counter";
}
