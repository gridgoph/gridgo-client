/**
 * Holding a wait on screen for a fixed minimum (gridgoph/gridgo-client#155).
 *
 * After a client changes what GRIDGO matches on, "GRIDGO is finding a printer"
 * stays up for at least three seconds before the new answer lands. That is
 * deliberate pacing, not a progress bar: a new Top Pick that replaced the old
 * one in a blink read as nothing having happened. So the floor is a fixed
 * timer started with the work, never derived from how long the match took — a
 * match that takes five seconds is shown after five, one that takes a tenth of
 * a second after three.
 */

/** How long the finding-a-printer wait holds after a priority change. */
export const REMATCH_MINIMUM_MS = 3000;

/**
 * Settle with `work`, but not before `minimumMs` has passed since the call.
 * A failure waits out the same floor, so an error does not flash in early
 * either.
 */
export async function withMinimumWait<T>(work: Promise<T>, minimumMs: number): Promise<T> {
  const floor = new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, minimumMs)));
  const [settled] = await Promise.all([
    work.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    floor,
  ]);
  if (!settled.ok) throw settled.error;
  return settled.value;
}
