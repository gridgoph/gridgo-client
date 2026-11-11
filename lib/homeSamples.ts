/**
 * What Home shows every client below their jobs: FEATURED PRINTS.
 *
 * The row is curated. GRIDGO's staff pick which approved products appear and
 * in what order (gridgo-api `docs/FEATURED_PRINTS_API.md`); the app draws that
 * list as sent and never fills it with anything else. It used to be picked off
 * the shops' live boards, which is a short step from showing what other
 * clients are printing — the thing reports 36D13C56 and C0266B02 asked never to
 * happen. So there is no fallback to boards, orders or a ranking: an empty,
 * failed or missing read is no row at all, and the start board under it is
 * still the way in.
 *
 * The card is an allowlist on the server and stays one here. It carries the
 * product, GRIDGO's own starting price and a signed sample photo — never the
 * shop that listed it (`lib/gridgoOffice.ts`).
 */

import { pagePadding, spacing } from "@/constants/theme";
import type { CatalogPricingUnit, FeaturedPrint, MeasureUnit } from "@/lib/api";
import { hasStalePhotoLink } from "@/lib/photoLinks";

export type HomeSample = FeaturedPrint;

const PRICING_UNITS: readonly CatalogPricingUnit[] = [
  "per_unit",
  "per_package",
  "per_page",
  "per_area",
  "per_length",
  "whole_job",
];
const MEASURE_UNITS: readonly MeasureUnit[] = ["mm", "cm", "in", "ft", "m"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function wholeOrNull(value: unknown): number | null {
  return Number.isSafeInteger(value) ? (value as number) : null;
}

function photosOf(value: unknown): FeaturedPrint["photos"] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((photo, index) => ({
    fileId: text(photo.fileId) ?? `photo_${index}`,
    sortOrder: wholeOrNull(photo.sortOrder) ?? index,
    url: text(photo.url) ?? "",
    downloadUrl: text(photo.downloadUrl) ?? undefined,
    downloadUrlExpiresAt: text(photo.downloadUrlExpiresAt) ?? undefined,
  }));
}

function cardOf(value: unknown): FeaturedPrint | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const name = text(value.name);
  const categoryCode = text(value.categoryCode);
  const subcategoryCode = text(value.subcategoryCode);
  const price = value.clientFromPriceMinor;
  // A card that cannot be started, or has no honest price, is not drawn: a
  // dash where the starting price goes is worse than one card fewer.
  if (!id || !name || !categoryCode || !subcategoryCode) return null;
  if (!Number.isSafeInteger(price) || (price as number) < 0) return null;
  const unit = PRICING_UNITS.find((known) => known === value.pricingUnit) ?? "per_unit";
  return {
    id,
    name,
    categoryCode,
    subcategoryCode,
    clientFromPriceMinor: price as number,
    pricingUnit: unit,
    packageQty: wholeOrNull(value.packageQty),
    measureUnit: MEASURE_UNITS.find((known) => known === value.measureUnit) ?? null,
    minimumOrderQuantity: wholeOrNull(value.minimumOrderQuantity),
    photos: photosOf(value.photos),
  };
}

/**
 * The cards of a `GET /featured-prints` body, in staff order.
 *
 * Forgiving on purpose: anything that is not a usable card is dropped, a body
 * without `items` is an empty row, and the same product listed twice is drawn
 * once. The `emptyState` prompt is not drawn — the start board directly below
 * the row is already the catalogue link it describes.
 */
export function featuredPrintsFrom(body: unknown): HomeSample[] {
  if (!isRecord(body) || !Array.isArray(body.items)) return [];
  const seen = new Set<string>();
  const cards: HomeSample[] = [];
  for (const entry of body.items) {
    const card = cardOf(entry);
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
  }
  return cards;
}

// ---------------------------------------------------------------------------
// How the Featured Prints carousel is cut
// ---------------------------------------------------------------------------

/** The gap between two cards, and the step the carousel snaps by after a card. */
export const FEATURED_GAP = spacing.md;

/**
 * How many cards a phone shows at rest: two whole cards and the leading edge
 * of the third. A row that ends flush with the screen edge reads as the whole
 * shelf; the cut third card is what says the row scrolls.
 */
export const FEATURED_VISIBLE_CARDS = 2.3;

/** Never so narrow the name is all ellipsis, never so wide it fills a tablet. */
const MIN_FEATURED_WIDTH = 112;
const MAX_FEATURED_WIDTH = 220;

/**
 * The width of one featured card, cut from the screen it scrolls across.
 *
 * The row runs edge to edge, but its first card starts on Home's page padding
 * (`pagePadding`), so what is visible at rest is that padding, two cards, two
 * gaps and the edge of the third. Measured from the window, never from a
 * layout pass, so the first frame is already the right size.
 */
export function featuredCardWidth(screenWidth: number): number {
  const usable = screenWidth - pagePadding - FEATURED_GAP * 2;
  const fitted = Math.floor(usable / FEATURED_VISIBLE_CARDS);
  return Math.min(MAX_FEATURED_WIDTH, Math.max(MIN_FEATURED_WIDTH, fitted));
}

/** The product photo is a 3:4 portrait, so every card is the same tall shape. */
export function featuredImageHeight(cardWidth: number): number {
  return Math.round((cardWidth * 4) / 3);
}

/** One card and the gap after it: the distance each snap moves the row. */
export function featuredSnapInterval(cardWidth: number): number {
  return cardWidth + FEATURED_GAP;
}

// ---------------------------------------------------------------------------
// Keeping the held list across re-reads
// ---------------------------------------------------------------------------

/**
 * Do two reads show the same cards? Same products in the same order, the same
 * words and price on each, and the same photo files — the signed links may
 * differ, because every read signs them afresh.
 */
export function sameFeaturedPrints(held: readonly HomeSample[], next: readonly HomeSample[]): boolean {
  if (held.length !== next.length) return false;
  return held.every((card, index) => {
    const other = next[index];
    return (
      card.id === other.id &&
      card.name === other.name &&
      card.categoryCode === other.categoryCode &&
      card.subcategoryCode === other.subcategoryCode &&
      card.clientFromPriceMinor === other.clientFromPriceMinor &&
      card.pricingUnit === other.pricingUnit &&
      card.packageQty === other.packageQty &&
      card.measureUnit === other.measureUnit &&
      card.minimumOrderQuantity === other.minimumOrderQuantity &&
      card.photos.length === other.photos.length &&
      card.photos.every((photo, at) => photo.fileId === other.photos[at].fileId)
    );
  });
}

/**
 * What Home holds after a routine re-read (focus, live refresh).
 *
 * Home re-reads on every focus and every live refresh, including the 30 s
 * reconcile while the live stream is down, and each read signs every photo
 * link afresh. Swapping in the new list for the same cards gave every photo a
 * new address to download and re-laid the block out under the client's thumb:
 * the "keeps reloading" report. So the same cards keep the list already on
 * screen — unless a held link is stale, when the fresh links are taken (the
 * photo is cached by its file id, so a new link to the same file does not
 * download it again).
 */
export function keepHeldFeatured(
  held: HomeSample[] | null,
  next: HomeSample[],
  now: number = Date.now(),
): HomeSample[] {
  if (!held || !sameFeaturedPrints(held, next)) return next;
  return hasStalePhotoLink(held, now) ? next : held;
}
