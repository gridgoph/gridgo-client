/**
 * Start the match as soon as the client picks what to print.
 *
 * The match screen used to fire `POST /me/matches` only after it mounted, so
 * the whole navigation sat on a skeleton. Kicking the same request off from
 * the picker (and again from the drop-off screen when distance ranked first)
 * means the shop is often already waiting when the next screen opens.
 *
 * One in-flight result is held, keyed by the thing being printed, where it
 * is going, by when, and the ranking it was asked with. A failed read is
 * dropped so the match screen retries cleanly.
 */

import * as api from "@/lib/api";

type Entry = { key: string; at: number; promise: Promise<api.MatchResult> };

let current: Entry | null = null;

/**
 * How long a held match is worth reusing. Long enough to cross the ranking
 * step; well inside the fifteen minutes its pick tokens live, so a reused
 * answer can still be taken.
 */
export const MATCH_REUSE_MS = 5 * 60_000;

function reusable(key: string): Entry | null {
  if (current?.key !== key) return null;
  return Date.now() - current.at < MATCH_REUSE_MS ? current : null;
}

function keyOf(input: api.MatchInput): string {
  const dropoff = input.dropoff;
  return JSON.stringify({
    subcategoryCode: input.subcategoryCode,
    // A job re-ranked for itself is a different question from the usual
    // order, and must never be answered with the other's match.
    ranking: input.ranking ?? null,
    cartId: input.cartId ?? null,
    deadline: input.deadline ?? null,
    dropoff: dropoff
      ? { lat: dropoff.lat, lng: dropoff.lng, label: dropoff.label ?? null }
      : null,
  });
}

export function prefetchMatch(input: api.MatchInput): Promise<api.MatchResult> {
  const key = keyOf(input);
  const held = reusable(key);
  if (held) return held.promise;
  const promise = api.matchShop(input);
  current = { key, at: Date.now(), promise };
  void promise.catch(() => {
    if (current?.promise === promise) current = null;
  });
  return promise;
}

export function takeMatch(input: api.MatchInput): Promise<api.MatchResult> {
  return prefetchMatch(input);
}

export function clearMatchPrefetch(): void {
  current = null;
}
