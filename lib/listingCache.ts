/**
 * Carry a listing from the match screen onto the order sheet.
 *
 * The sheet used to wait on `GET /catalog/items/:id` (signed sample photos)
 * before drawing anything, even though the match already returned that listing.
 * A fresh cache paints on the first frame and does not hit the network. A stale
 * cache still paints immediately; the re-read runs in the background and must
 * never blank the sheet.
 */

import * as api from "@/lib/api";

type Entry = { at: number; item: api.CatalogItem };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<api.CatalogItem>>();

/** Long enough to cross the tap from match to the sheet. */
export const LISTING_TTL_MS = 60_000;

export function rememberListing(item: api.CatalogItem): void {
  cache.set(item.id, { at: Date.now(), item });
}

export function listingNow(itemId: string | null | undefined): api.CatalogItem | null {
  if (!itemId) return null;
  const held = cache.get(itemId);
  if (!held) return null;
  return held.item;
}

export function listingIsFresh(itemId: string | null | undefined): boolean {
  if (!itemId) return false;
  const held = cache.get(itemId);
  if (!held) return false;
  return Date.now() - held.at < LISTING_TTL_MS;
}

/** True when this is the shop's full sheet, not a cart-line stub. */
export function isFullListing(
  listing: api.CatalogItem | null | undefined,
): listing is api.CatalogItem {
  return Boolean(listing && Array.isArray(listing.optionGroups) && Array.isArray(listing.photos));
}

/**
 * Compact line mutations omit photos and option groups so add/save does not
 * wait on signing. Keep the sheet the match already gave us.
 */
export function hydrateCartListings(cart: api.Cart, previous: api.Cart | null = null): api.Cart {
  return {
    ...cart,
    lines: cart.lines.map((line) => {
      if (isFullListing(line.listing)) return line;
      const prior = previous?.lines.find((row) => row.id === line.id)?.listing ?? null;
      const cached = listingNow(line.catalogItemId);
      const listing = isFullListing(prior) ? prior : cached ?? line.listing;
      return listing === line.listing ? line : { ...line, listing };
    }),
  };
}

export function clearListingCache(): void {
  cache.clear();
  inflight.clear();
}

async function refresh(itemId: string): Promise<api.CatalogItem> {
  const pending = inflight.get(itemId);
  if (pending) return pending;
  const next = api
    .getCatalogItem(itemId)
    .then((item) => {
      if (inflight.get(itemId) !== next) throw new Error("This listing changed. Open it again.");
      rememberListing(item);
      return item;
    })
    .finally(() => {
      if (inflight.get(itemId) === next) inflight.delete(itemId);
    });
  inflight.set(itemId, next);
  return next;
}

/** Start the network read while the sheet is still sliding in. */
export function prefetchListing(itemId: string): void {
  if (listingIsFresh(itemId)) return;
  void refresh(itemId).catch(() => undefined);
}

/**
 * Instant if the match already gave us this listing; otherwise one network read.
 * A stale cache still returns immediately and refreshes in the background.
 */
export async function takeListing(itemId: string): Promise<api.CatalogItem> {
  const held = listingNow(itemId);
  if (held) {
    if (!listingIsFresh(itemId)) void refresh(itemId).catch(() => undefined);
    return held;
  }
  return refresh(itemId);
}
