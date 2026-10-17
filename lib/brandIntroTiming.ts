/**
 * When each beat of the opening happens (#237).
 *
 * The beats are the legacy Flutter screen's, unchanged. What changed is where
 * the clock starts. On the web a sting plays the moment it is asked, so the
 * motion could run off a fixed timer. On an Android phone the stings are still
 * loading when that timer fires, and the sound arrived after the dots it
 * belongs to. So the motion now waits for the sound — for a short, capped
 * time — and starts with it.
 *
 * The wait is paid for out of the wordmark's hold, so the opening keeps its
 * length: a phone that has its stings ready in a few hundred milliseconds
 * runs exactly as long as before, and the slowest one runs
 * `SOUND_WAIT_MS - HOLD_GIVE_MS` longer. A sound that is not ready by then is
 * dropped rather than played late; a sting that lands after its beat belongs
 * to nothing.
 *
 * Every number here is in milliseconds, and pure, so the timing is tested
 * without a phone (`lib/__tests__/brandIntroTiming.test.ts`).
 */

/** Dots in the grid, lit one after another. */
export const DOT_COUNT = 9;
/** A beat on the empty canvas before the first dot. Also the shortest lead-in. */
export const LEAD_IN = 300;
/** Gap between one dot starting and the next. */
export const DOT_STAGGER = 90;
/** How long one dot takes to arrive. */
export const DOT_MS = 400;
/** The cascade's own clock: last dot's start plus its run. */
export const CASCADE_SPAN = (DOT_COUNT - 1) * DOT_STAGGER + DOT_MS;

/** The swell starts while the last dot is still arriving. */
export const ENGULF_OFFSET = (DOT_COUNT - 1) * DOT_STAGGER + 120;
export const ENGULF_MS = 600;

/** GRIDGO comes up on the yellow, with the outro sting. */
export const WORDMARK_OFFSET = ENGULF_OFFSET + 700;
export const WORDMARK_MS = 350;

/**
 * How long the wordmark holds before the exit when the sound was ready at
 * once. The exit itself is longer and softer than the old 400ms cut, so this
 * is 300ms shorter than the old 1500ms hold: the overlay is gone at the same
 * moment it always was.
 */
export const HOLD_MS = 1200;
/** The most of the hold a slow sound may take back. */
export const HOLD_GIVE_MS = 400;

/**
 * The exit: the wordmark softens and goes first, then the yellow dissolves
 * into the first screen. `EXIT_MS` is the whole of it.
 */
export const EXIT_MS = 700;
/** The wordmark's own part of the exit — fade, slight lift and blur. */
export const EXIT_WORDMARK_MS = 420;
/** The yellow follows the wordmark by this much, so the two read as one move. */
export const EXIT_FIELD_DELAY = 120;
/** The blur the wordmark softens to as it goes. Light, not a smear. */
export const EXIT_BLUR = 6;

/**
 * The longest the lead-in stretches while the stings load. On a release build
 * they are in the APK and ready well inside this; Expo Go fetches them from
 * Metro and may not be.
 */
export const SOUND_WAIT_MS = 600;
/**
 * After `play()`, how long the motion waits to hear that the intro really is
 * playing. Android's player says so once its renderer starts, which is when
 * the sound reaches the speaker; a player that never says is not waited on.
 */
export const PLAY_START_WAIT_MS = 250;

/**
 * Reduced motion: the finished frame, held long enough to read. 300ms shorter
 * than before #237 because the exit is 300ms longer; the total is the same.
 */
export const REDUCED_HOLD = 600;

export type IntroTimeline = {
  /** Motion start: the first dot, and the intro sting. */
  startAt: number;
  engulfAt: number;
  /** The wordmark, and the outro sting. */
  wordmarkAt: number;
  /** The exit begins. */
  exitAt: number;
  /** The overlay is gone and the app is uncovered. */
  endAt: number;
};

/**
 * The beats, measured from the overlay mounting, for motion that starts at
 * `startAt`. A start earlier than `LEAD_IN` is held to it, and one later than
 * the sound wait allows is held to that; the hold gives back the difference,
 * down to `HOLD_MS - HOLD_GIVE_MS`.
 */
export function introTimeline(startAt: number = LEAD_IN): IntroTimeline {
  const start = Math.min(Math.max(startAt, LEAD_IN), LEAD_IN + SOUND_WAIT_MS);
  const waited = start - LEAD_IN;
  const hold = HOLD_MS - Math.min(waited, HOLD_GIVE_MS);
  const wordmarkAt = start + WORDMARK_OFFSET;
  const exitAt = wordmarkAt + hold;
  return {
    startAt: start,
    engulfAt: start + ENGULF_OFFSET,
    wordmarkAt,
    exitAt,
    endAt: exitAt + EXIT_MS,
  };
}

/** Reduced motion: the frame from the first paint, the exit after the hold. */
export function reducedTimeline(startAt: number = 0): IntroTimeline {
  const start = Math.min(Math.max(startAt, 0), SOUND_WAIT_MS);
  const exitAt = start + REDUCED_HOLD;
  return {
    startAt: start,
    engulfAt: start,
    wordmarkAt: start,
    exitAt,
    endAt: exitAt + EXIT_MS,
  };
}
