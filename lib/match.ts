/**
 * Reading GRIDGO's match back to the client.
 *
 * The matching itself is the platform's (`POST /me/matches`, gridgo-api#126):
 * it ranks every shop that can make the client's date strictly by the order
 * they put quality, speed, cost and distance in — the first factor that
 * differs decides, later ones only break ties — and answers with a Top Pick,
 * one badge saying which factor decided it, and every other shop's best
 * listing for the job.
 *
 * This module turns that answer into what the screen draws. The badge is the
 * API's `matchReason.label`, never the legacy `reasons` (their `detail` strings
 * are working notes like "88% listing completeness" and must not reach a
 * screen). Nothing is invented: every place in line, date and price came back
 * from the match.
 *
 * No line here names a press, locates one, or counts them. Other shops'
 * listings arrive with no shop identity at all, and the Top Pick's compatibility
 * `shop` block is never read.
 */

import type {
  CatalogItem,
  MatchListing,
  MatchResult,
  OtherListing,
} from "@/lib/api";
import { completeRanking, type PriorityRanking } from "@/lib/priorities";

/** Either kind of listing a client can pick on the match screen. */
export type PickableListing = MatchListing | OtherListing;

/**
 * The Top Pick's badge, as the overline sets it: "MATCHED FOR QUALITY".
 * Null on an API from before the badge, where nothing honest can be said.
 */
export function matchBadge(match: Pick<MatchResult, "matchReason">): string | null {
  const label = match.matchReason?.label?.trim();
  return label ? label.toUpperCase() : null;
}

/** The listing the Top Pick card shows and Proceed opens. */
export function topPickListing(match: Pick<MatchResult, "listings">): MatchListing | null {
  return match.listings[0] ?? null;
}

/**
 * Everything else the client could take instead, for the "Other listings"
 * section: one listing from every other shop that can make the date, in the
 * API's order, then the Top Pick board's other listings for the same job.
 * None of them says whose it is.
 */
export function otherListingsOf(
  match: Pick<MatchResult, "listings" | "otherListings">,
): PickableListing[] {
  return [...(match.otherListings ?? []), ...match.listings.slice(1)];
}

/**
 * The ranking the match was made on. GRIDGO echoes it (`ranking`); before it
 * answers, or on an older API, it is whatever the screen asked with.
 */
export function matchedRanking(
  match: Pick<MatchResult, "ranking"> | null | undefined,
  asked: PriorityRanking | null,
): PriorityRanking | null {
  return completeRanking(match?.ranking) ?? asked;
}

/**
 * "4th" — the place this job would take in that press's queue, drawn large.
 * GRIDGO counts it from jobs really in front, so it can be shown at all; a
 * missing or nonsensical place draws nothing rather than a guess.
 */
export function placeOrdinal(placeInLine: number | null | undefined): string | null {
  if (typeof placeInLine !== "number" || !Number.isFinite(placeInLine) || placeInLine < 1) {
    return null;
  }
  return ordinal(placeInLine);
}

/** The same place, as a screen reader should say it. */
export function placeLabel(placeInLine: number | null | undefined): string | null {
  const place = placeOrdinal(placeInLine);
  return place ? `${place} in line` : null;
}

/**
 * "Ready tomorrow", "Ready in 3 days": how many Davao calendar days away the
 * listing's client promise is. Only the promise (`readyBy`) is read — never
 * production time or the shop's own date — and it counts calendar days rather
 * than rounding hours, so this line and the READY BY date can never disagree.
 */
export function readyInLine(
  readyBy: string | null | undefined,
  now: number = Date.now(),
): string | null {
  const at = readyBy ? Date.parse(readyBy) : Number.NaN;
  if (!Number.isFinite(at) || at <= now) return null;
  const days = davaoDayNumber(at) - davaoDayNumber(now);
  if (days === 0) return "Ready today";
  if (days === 1) return "Ready tomorrow";
  return `Ready in ${days} days`;
}

/** Davao keeps +08:00 all year, so a fixed offset is its calendar. */
const DAVAO_OFFSET_MS = 8 * 3_600_000;

function davaoDayNumber(at: number): number {
  return Math.floor((at + DAVAO_OFFSET_MS) / 86_400_000);
}

/** "1st", "2nd", "3rd" — how a queue position is said out loud. */
export function ordinal(position: number): string {
  const rounded = Math.floor(position);
  const tens = rounded % 100;
  if (tens >= 11 && tens <= 13) return `${rounded}th`;
  switch (rounded % 10) {
    case 1:
      return `${rounded}st`;
    case 2:
      return `${rounded}nd`;
    case 3:
      return `${rounded}rd`;
    default:
      return `${rounded}th`;
  }
}

/**
 * True for a listing that came with the whole catalogue sheet — the Top Pick's
 * own board. Another shop's listing is the anonymous projection, which leaves
 * out the free text a shop writes (description, preparation steps).
 */
export function hasFullSheet(listing: PickableListing): listing is MatchListing {
  return Array.isArray((listing as Partial<CatalogItem>).prepSteps);
}

/**
 * The listing as the order sheet reads it. Another shop's listing carries no
 * shop and none of the shop's free text, so those fields are filled empty —
 * never guessed — and the sheet's own read of the listing fills in what is
 * real (`lib/listingCache.ts`).
 */
export function sheetListing(listing: PickableListing): CatalogItem {
  if (hasFullSheet(listing)) return listing;
  return {
    ...listing,
    supplierId: "",
    supplierServiceId: "",
    description: null,
    turnaroundMode: "inherit",
    prepSteps: [],
    serviceVersion: 0,
  };
}
