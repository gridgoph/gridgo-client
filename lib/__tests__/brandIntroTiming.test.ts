import {
  ENGULF_OFFSET,
  EXIT_FIELD_DELAY,
  EXIT_MS,
  EXIT_WORDMARK_MS,
  HOLD_GIVE_MS,
  LEAD_IN,
  REDUCED_HOLD,
  SOUND_WAIT_MS,
  WORDMARK_OFFSET,
  introTimeline,
  reducedTimeline,
} from "@/lib/brandIntroTiming";

/**
 * #237: on a phone the sound came in after the dots it belongs to, and the
 * opening cut to the app. The motion now starts with the sound, and leaves on
 * a soft dissolve — without the opening getting noticeably longer.
 */

/** The opening's length before #237: lead-in, swell, wordmark, 1.5 s hold, 400 ms cut. */
const LENGTH_BEFORE = 300 + 840 + 700 + 1500 + 400;

describe("introTimeline", () => {
  it("runs exactly as long as it did when the sound is ready at once", () => {
    expect(introTimeline().endAt).toBe(LENGTH_BEFORE);
    expect(introTimeline(0).startAt).toBe(LEAD_IN);
  });

  it("moves every beat with the sound, so the outro still lands on the wordmark", () => {
    const prompt = introTimeline(LEAD_IN);
    const late = introTimeline(LEAD_IN + 250);

    expect(late.startAt).toBe(LEAD_IN + 250);
    expect(late.engulfAt - late.startAt).toBe(ENGULF_OFFSET);
    expect(late.wordmarkAt - late.startAt).toBe(WORDMARK_OFFSET);
    expect(late.wordmarkAt - prompt.wordmarkAt).toBe(250);
  });

  it("pays for a short wait out of the hold, so the length does not change", () => {
    expect(introTimeline(LEAD_IN + HOLD_GIVE_MS).endAt).toBe(LENGTH_BEFORE);
  });

  it("never waits past the cap, and the slowest phone runs only a little longer", () => {
    const slowest = introTimeline(LEAD_IN + SOUND_WAIT_MS);
    expect(introTimeline(10_000)).toEqual(slowest);
    expect(slowest.endAt - LENGTH_BEFORE).toBe(SOUND_WAIT_MS - HOLD_GIVE_MS);
    expect(slowest.endAt - LENGTH_BEFORE).toBeLessThanOrEqual(250);
  });

  it("still holds the wordmark long enough to read after the longest wait", () => {
    const slowest = introTimeline(LEAD_IN + SOUND_WAIT_MS);
    expect(slowest.exitAt - slowest.wordmarkAt).toBeGreaterThanOrEqual(800);
  });

  it("leaves on a dissolve longer than the old cut, the wordmark ahead of the yellow", () => {
    const { exitAt, endAt } = introTimeline();
    expect(endAt - exitAt).toBe(EXIT_MS);
    expect(EXIT_MS).toBeGreaterThan(400);
    expect(EXIT_WORDMARK_MS).toBeLessThan(EXIT_MS);
    expect(EXIT_FIELD_DELAY).toBeGreaterThan(0);
    expect(EXIT_FIELD_DELAY).toBeLessThan(EXIT_WORDMARK_MS);
  });
});

describe("reducedTimeline", () => {
  it("is the finished frame from the start: no cascade and no swell to wait for", () => {
    const timeline = reducedTimeline();
    expect(timeline.startAt).toBe(0);
    expect(timeline.engulfAt).toBe(0);
    expect(timeline.wordmarkAt).toBe(0);
  });

  it("holds for a look, then takes the same soft exit, as long as before", () => {
    // Before #237: a 900 ms hold and a 400 ms fade.
    expect(reducedTimeline().endAt).toBe(900 + 400);
    expect(reducedTimeline().exitAt).toBe(REDUCED_HOLD);
    expect(reducedTimeline().endAt).toBe(REDUCED_HOLD + EXIT_MS);
  });

  it("starts the hold with its sting, within the same cap", () => {
    expect(reducedTimeline(200).exitAt).toBe(200 + REDUCED_HOLD);
    expect(reducedTimeline(10_000)).toEqual(reducedTimeline(SOUND_WAIT_MS));
  });
});
