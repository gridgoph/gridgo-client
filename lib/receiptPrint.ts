/**
 * The order-summary slip's one printed moment, as numbers.
 *
 * The slip feeds out of a printer slot at the top of the screen, its torn edge
 * first, eases to rest a hair past its mark and settles back — the small
 * jolt of a slip being torn off. The thank-you under it fades in as the paper
 * stops. The whole thing stays inside ~1.5 s and never gates anything: the
 * actions are on screen from the first frame, and any touch finishes it.
 *
 * Reduce motion starts the slip where it ends, with the thank-you shown.
 */

/** How long the paper feeds out of the slot. */
export const PRINT_FEED_MS = 1000;
/** The settle back after the tear-off overshoot. */
export const PRINT_SETTLE_MS = 160;
/** How far past its rest the slip travels before it settles, in px. */
export const PRINT_OVERSHOOT_PX = 6;
/** When the thank-you starts to fade in: as the paper comes to rest. */
export const THANKS_DELAY_MS = 1000;
export const THANKS_FADE_MS = 240;
/** How far the thank-you rises as it fades in, in px. */
export const THANKS_RISE_PX = 8;

/** The whole moment, first frame to last. */
export const RECEIPT_PRINT_TOTAL_MS = Math.max(
  PRINT_FEED_MS + PRINT_SETTLE_MS,
  THANKS_DELAY_MS + THANKS_FADE_MS,
);

/**
 * Where the slip waits before it has been measured: far above the slot, so
 * nothing shows until the feed knows how long the paper is.
 */
export const SLIP_UNMEASURED_OFFSET = -4000;

export type PrintFrame = {
  /** The slip's vertical offset from its resting place, in px. */
  slipOffset: number;
  /** The thank-you's opacity, 0–1. */
  thanksOpacity: number;
};

/** Where everything ends — and where a tap or reduce motion jumps to. */
export const PRINT_END_FRAME: PrintFrame = { slipOffset: 0, thanksOpacity: 1 };

/** Where the slip and the thank-you stand on the first frame. */
export function printStartFrame(reducedMotion: boolean): PrintFrame {
  return reducedMotion ? PRINT_END_FRAME : { slipOffset: SLIP_UNMEASURED_OFFSET, thanksOpacity: 0 };
}

/** The offset a measured slip feeds from: its whole height, tucked in the slot. */
export function slipFeedFrom(slipHeight: number): number {
  return slipHeight > 0 ? -Math.ceil(slipHeight) : 0;
}
