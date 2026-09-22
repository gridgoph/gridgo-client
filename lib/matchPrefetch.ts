/**
 * Start the match as soon as the client picks what to print.
 *
 * The match screen used to fire `POST /me/matches` only after it mounted, so
 * the whole navigation sat on a skeleton. Kicking the same request off from
 * the picker (and again from the drop-off screen when distance ranked first)
 * means the shop is often already waiting when the next screen opens.
 *
 * One in-flight result is held, keyed by the thing being printed and where it
 * is going. A failed read is dropped so the match screen retries cleanly.
 */

import * as api from "@/lib/api";

type Entry = { key: string; promise: Promise<api.MatchResult> };

let current: Entry | null = null;

function keyOf(input: api.MatchInput): string {
  const dropoff = input.dropoff;
  return JSON.stringify({
    subcategoryCode: input.subcategoryCode,
    cartId: input.cartId ?? null,
    deadline: input.deadline ?? null,
    dropoff: dropoff
      ? { lat: dropoff.lat, lng: dropoff.lng, label: dropoff.label ?? null }
      : null,
  });
}

export function prefetchMatch(input: api.MatchInput): Promise<api.MatchResult> {
  const key = keyOf(input);
  if (current?.key === key) return current.promise;
  const promise = api.matchShop(input);
  current = { key, promise };
  void promise.catch(() => {
    if (current?.key === key) current = null;
  });
  return promise;
}

export function takeMatch(input: api.MatchInput): Promise<api.MatchResult> {
  const key = keyOf(input);
  if (current?.key === key) return current.promise;
  return prefetchMatch(input);
}

export function clearMatchPrefetch(): void {
  current = null;
}
