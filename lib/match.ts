/**
 * Reading GRIDGO's match back to the client.
 *
 * The matching itself is the platform's: `POST /me/matches` scores every
 * approved open shop with a public listing for the thing being printed,
 * weighted by the order the client put quality, speed and distance in, and
 * answers with one shop, the queue in front of it, and the reasons it won.
 *
 * This module turns that into something a person can read. The API's `detail`
 * strings are working notes — "0 jobs ahead; about 48 hours", "88% listing
 * completeness" — and none of them belongs on a client's screen, so the
 * sentence is written here from the structured fields instead. Nothing is
 * invented: every number in it came back from the match.
 *
 * The shop is GRIDGO's business, not the client's. These lines say what GRIDGO
 * decided and what it means for the job; none of them names a press, locates
 * one, or implies there is a list of them to go and browse.
 */

import type { MatchQueue, MatchReason, MatchResult } from "@/lib/api";
import { readyInShort } from "@/lib/listing";
import { formatDistance, haversineMetres, type GeoPoint } from "@/lib/tracking";

/** The reason the card leads with — the bundle, else the top-ranked factor. */
export function primaryReason(reasons: MatchReason[]): MatchReason | null {
  if (reasons.length === 0) return null;
  return [...reasons].sort((left, right) => left.rank - right.rank)[0];
}

/** The overline on the match card. */
export function reasonTag(factor: MatchReason["factor"]): string {
  switch (factor) {
    case "quality":
      return "STRONGEST LISTING";
    case "speed":
      return "FASTEST";
    case "cost":
      return "BEST PRICE";
    case "distance":
      return "CLOSEST";
    case "bundle":
      return "ALREADY IN YOUR ORDER";
  }
}

/**
 * One line of why, in the client's own terms.
 *
 * Concrete wherever GRIDGO has a real figure — a ready-in, a distance — and
 * plain when it does not. It never claims to have beaten shops that were not
 * there: with no alternatives the line says this is the shop printing it,
 * which is true, rather than "fastest" with nothing to be faster than.
 */
export function reasonLine({
  reason,
  queue,
  distanceMeters,
  alternativesCount,
  subcategoryName,
}: {
  reason: MatchReason | null;
  queue: MatchQueue;
  distanceMeters: number | null;
  alternativesCount: number;
  subcategoryName: string;
}): string {
  const thing = subcategoryName.toLowerCase();
  const ready = readyInShort(queue.estimatedHours);

  if (reason?.factor === "bundle") {
    return `Already printing something else in this order, so it travels as one job.`;
  }

  if (alternativesCount === 0) {
    return ready
      ? `The only printer GRIDGO can put ${thing} on today — about ${ready} once your artwork is approved.`
      : `The only printer GRIDGO can put ${thing} on today.`;
  }

  switch (reason?.factor) {
    case "speed":
      return ready
        ? `Fastest on ${thing} — about ${ready} including what is in front of you.`
        : `Fastest on ${thing}.`;
    case "distance":
      return distanceMeters == null
        ? `Closest to your drop-off.`
        : `Closest to your drop-off — ${formatDistance(distanceMeters / 1000)} away.`;
    case "quality":
      return `Fullest ${thing} board on GRIDGO — the most choices, with real samples.`;
    default:
      return `GRIDGO's match for ${thing}.`;
  }
}

/**
 * How far the job's print run starts from where it is going.
 *
 * The API scores distance but reports it only inside a working note, so it is
 * measured again here from the assigned press's own pin — the same great-circle
 * metres the server used. It never reaches a screen as a place: only as this
 * one number, which is what delivery is priced on. Null when the client has not
 * given a drop-off, in which case distance did not enter the match either.
 */
export function matchDistanceMeters(
  match: Pick<MatchResult, "shop">,
  dropoff: GeoPoint | null,
): number | null {
  const pin = match.shop.shop;
  if (!pin || !dropoff) return null;
  return Math.round(haversineMetres({ lat: pin.lat, lng: pin.lng }, dropoff));
}

/**
 * Where a new job would sit in the queue it is joining.
 *
 * `jobsAhead` is how many are in front, so the client's own place is one past
 * that. GRIDGO counts it from jobs that are actually live on that press, which
 * is why it can be shown at all — a guess here is the one number a client
 * would book a launch date against.
 */
export function queueLine(queue: MatchQueue | null | undefined): string | null {
  const ahead = queue?.jobsAhead;
  if (typeof ahead !== "number" || !Number.isFinite(ahead) || ahead < 0) return null;
  if (ahead === 0) return "Next in line";
  return `${ordinal(ahead + 1)} in line`;
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


