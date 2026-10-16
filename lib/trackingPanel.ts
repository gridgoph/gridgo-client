/**
 * The delivery screen's pull-up panel: where it rests and where it settles.
 *
 * The map is the screen while a rider has the job (gridgo-client#232), so the
 * panel rests low — tall enough to say where the delivery stands and nothing
 * more — and pulls up over the map for the rest of the order. Pure numbers, so
 * the feel is a check anyone can repeat rather than "it looked right".
 */

/** The panel never takes less than this share of the screen at rest… */
export const PEEK_MIN_SHARE = 0.26;
/** …and never more, so the map always keeps the larger part of the screen. */
export const PEEK_MAX_SHARE = 0.5;
/** Pulled up, a strip of map stays visible so it is clear what lies beneath. */
export const EXPANDED_MAP_STRIP = 72;
/** A flick this fast (px/ms) decides the direction whatever the distance. */
export const PANEL_FLICK_VELOCITY = 0.5;

export type PanelGeometry = {
  /** How much of the panel shows at rest, from the bottom edge. */
  peek: number;
  /** The panel's full height when pulled up. */
  height: number;
  /** How far the panel slides between the two stops. */
  travel: number;
};

/**
 * Where the two stops are, for a screen `screenHeight` tall whose resting
 * content measured `contentHeight`.
 *
 * The resting panel fits its content, held between the two shares: at a large
 * text size the content is taller, and a map squeezed to a sliver would defeat
 * the screen.
 */
export function panelGeometry(screenHeight: number, contentHeight: number): PanelGeometry {
  const height = Math.max(0, screenHeight - EXPANDED_MAP_STRIP);
  const min = Math.round(screenHeight * PEEK_MIN_SHARE);
  const max = Math.round(screenHeight * PEEK_MAX_SHARE);
  const peek = Math.min(height, Math.max(min, Math.min(max, Math.ceil(contentHeight))));
  return { peek, height, travel: Math.max(0, height - peek) };
}

/**
 * Which stop the panel settles on when the finger lifts.
 *
 * `offset` is how far the panel sits below its pulled-up position (0 is up,
 * `travel` is resting). A flick wins; otherwise the nearer stop does.
 */
export function settlePanel(
  offset: number,
  velocityY: number,
  travel: number,
): "expanded" | "collapsed" {
  if (velocityY <= -PANEL_FLICK_VELOCITY) return "expanded";
  if (velocityY >= PANEL_FLICK_VELOCITY) return "collapsed";
  return offset < travel / 2 ? "expanded" : "collapsed";
}

/** Follows the finger between the stops, and resists past either end. */
export function dragPanel(startOffset: number, dy: number, travel: number): number {
  const next = startOffset + dy;
  if (next < 0) return next / 4;
  if (next > travel) return travel + (next - travel) / 4;
  return next;
}
