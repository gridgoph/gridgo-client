/**
 * Is a held photo link still good?
 *
 * Every sample photo reaches the phone as a signed `downloadUrl` that GRIDGO's
 * storage honours for five minutes (`downloadUrlExpiresAt`). A screen holds its
 * board in state, and the app can sit in the background far longer than that —
 * so on resume the screen still draws links storage now answers with
 * `403 Request has expired`, and every tile used to read "This photo will not
 * load" at once. Nothing was wrong with the photos; the links were old.
 *
 * The fix is never a longer-lived link (that is a security trade on the
 * server): it is re-reading the board when what is held is stale. This module
 * only answers "stale?"; `hooks/usePhotoLinkRefresh.ts` owns the re-read and
 * `components/SamplePhoto.tsx` asks for it when a tile fails on an old link.
 */

import type { CatalogItem, CatalogPhoto } from "@/lib/api";

/**
 * How close to expiry a link counts as stale already. A large photo on mobile
 * data can take seconds to arrive, and a link that expires mid-transfer is as
 * dead as one that already has.
 */
export const PHOTO_LINK_MARGIN_MS = 30_000;

/**
 * How old a held read may be before a resume re-reads it regardless of what its
 * links say. Under the five-minute signing window by the margin above, so a
 * read with no expiry stamped on it is still refreshed before its links die.
 */
export const HELD_READ_MAX_AGE_MS = 240_000;

type ExpiringLink = { downloadUrlExpiresAt?: CatalogPhoto["downloadUrlExpiresAt"] | null } | null | undefined;

/** Milliseconds since epoch the link expires at, or null when it does not say. */
export function photoLinkExpiry(photo: ExpiringLink): number | null {
  const stamp = photo?.downloadUrlExpiresAt;
  if (!stamp) return null;
  const at = Date.parse(stamp);
  return Number.isFinite(at) ? at : null;
}

/**
 * True when the link has expired or will within the margin. A link with no
 * expiry (or an unreadable one) is not called stale: there is nothing to go on,
 * and a re-read on a guess is a request loop waiting to happen.
 */
export function photoLinkIsStale(photo: ExpiringLink, now: number = Date.now()): boolean {
  const at = photoLinkExpiry(photo);
  return at !== null && at - now <= PHOTO_LINK_MARGIN_MS;
}

/** The soonest any photo on these listings expires, or null when none says. */
export function earliestPhotoExpiry(
  items: readonly (Pick<CatalogItem, "photos"> | null | undefined)[],
): number | null {
  let earliest: number | null = null;
  for (const item of items) {
    for (const photo of item?.photos ?? []) {
      const at = photoLinkExpiry(photo);
      if (at !== null && (earliest === null || at < earliest)) earliest = at;
    }
  }
  return earliest;
}

/** True when any photo on these listings is stale. */
export function hasStalePhotoLink(
  items: readonly (Pick<CatalogItem, "photos"> | null | undefined)[],
  now: number = Date.now(),
): boolean {
  const at = earliestPhotoExpiry(items);
  return at !== null && at - now <= PHOTO_LINK_MARGIN_MS;
}

/** Every listing on a set of shop boards, for `earliestPhotoExpiry`. */
export function boardListings(
  boards: readonly { services: readonly { items: readonly CatalogItem[] }[] }[],
): CatalogItem[] {
  return boards.flatMap((board) => board.services.flatMap((service) => service.items));
}

/**
 * The same listings with their photos taken from a fresher read, matched by
 * listing id. Only the photos move: a listing the fresh read no longer carries
 * keeps what it had, and nothing else on a held listing is overwritten — the
 * match screen's listings are the match's answer, and re-running the match to
 * renew a photo would quietly move the client to a different shop.
 */
export function withFreshPhotos<T extends Pick<CatalogItem, "id" | "photos">>(
  listings: readonly T[],
  fresh: readonly Pick<CatalogItem, "id" | "photos">[],
): T[] {
  const byId = new Map(fresh.map((item) => [item.id, item.photos]));
  return listings.map((listing) => {
    const photos = byId.get(listing.id);
    return photos ? { ...listing, photos } : listing;
  });
}

/**
 * Should a screen coming back to the foreground re-read what it holds?
 *
 * Yes when the read is older than `HELD_READ_MAX_AGE_MS`, or when its earliest
 * photo link is stale. No when nothing is held — there is nothing to refresh,
 * and the screen's own load will run.
 */
export function heldReadIsStale(
  held: { readAt: number | null; earliestExpiry: number | null },
  now: number = Date.now(),
): boolean {
  if (held.readAt === null) return false;
  if (now - held.readAt >= HELD_READ_MAX_AGE_MS) return true;
  return held.earliestExpiry !== null && held.earliestExpiry - now <= PHOTO_LINK_MARGIN_MS;
}
