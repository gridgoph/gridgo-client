/**
 * The token that picks a listing off the match screen (gridgo-api#126).
 *
 * Every listing on the match — the Top Pick and each other shop's — comes with
 * an opaque `selectToken`, valid 15 minutes, bound to this client and this
 * match. Adding the listing to the basket sends it with the match's request
 * id, and GRIDGO resolves the press server-side and keeps the client's date on
 * the line all the way to checkout. Another shop's listing has no shop on it
 * at all, so the token is the only way to say which one was chosen.
 *
 * Held in memory by listing id between the tap and the order sheet's add, the
 * same way `lib/listingCache.ts` carries the listing itself. Dropped when a new
 * job starts, so a token from an earlier match cannot ride onto an unrelated
 * add, and on sign-out because it belongs to one client.
 */

import { ApiError } from "@/lib/api";

export type MatchSelection = {
  matchRequestId: string;
  selectToken: string;
  /** When the match's tokens stop working. Null when the API did not say. */
  expiresAt: string | null;
};

const held = new Map<string, MatchSelection>();

/** Keep the token for the listing the client just chose. */
export function holdMatchSelection(listingId: string, selection: MatchSelection): void {
  held.set(listingId, selection);
}

/** The token for a listing, if the client reached it from a match. */
export function matchSelectionFor(listingId: string | null | undefined): MatchSelection | null {
  if (!listingId) return null;
  return held.get(listingId) ?? null;
}

/** Matches the order sheet found could no longer be taken, by request id. */
const spent = new Set<string>();

export function clearMatchSelections(): void {
  held.clear();
  spent.clear();
}

/**
 * GRIDGO refused a pick from this match as out of date. The match screen
 * reads this on focus and asks again rather than offering the same picks.
 */
export function markMatchSpent(matchRequestId: string): void {
  spent.add(matchRequestId);
}

export function matchIsSpent(matchRequestId: string | null | undefined): boolean {
  return matchRequestId != null && spent.has(matchRequestId);
}

/** True once a match's tokens have run out, by this phone's clock. */
export function selectionExpired(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) && at <= now;
}

/**
 * Every refusal that means "this match can no longer be taken as it was":
 * the token ran out or does not fit, or the listing or its date changed since
 * matching. Each one leaves the basket untouched, and each has the same way
 * forward — match again.
 */
const STALE_MATCH_CODES = new Set([
  "invalid_select_token",
  "foreign_select_token",
  "select_token_expired",
  "select_token_request_mismatch",
  "select_token_cart_mismatch",
  "select_token_listing_mismatch",
  "select_token_dropoff_mismatch",
  "catalog_item_stale",
  "deadline_not_met",
]);

export function isStaleMatchRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const code = (error.body as { error?: unknown } | null)?.error;
  return typeof code === "string" && STALE_MATCH_CODES.has(code);
}

/** What the order sheet says when a match can no longer be taken. */
export const STALE_MATCH_MESSAGE =
  "This match is out of date — it is more than 15 minutes old, or the printer's queue has moved. Go back and GRIDGO will match again.";
