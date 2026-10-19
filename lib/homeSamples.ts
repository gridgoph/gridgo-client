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
// How wide a sample card is cut
// ---------------------------------------------------------------------------

/** The gap between two cards in the strip. */
export const SAMPLE_GAP = spacing.md;

/**
 * How much of the card after next stays on screen.
 *
 * A strip that ends flush with the screen edge is a strip nobody scrolls: the
 * two cards read as the whole shelf. This is the overhang that says otherwise —
 * wide enough to be an obvious cut edge rather than a rendering slip, narrow
 * enough that it is plainly not a third card offering itself to be read.
 */
export const SAMPLE_PEEK = 44;

/** Never so narrow the name wraps to nonsense, never so wide it fills a tablet. */
const MIN_SAMPLE_WIDTH = 148;
const MAX_SAMPLE_WIDTH = 200;

/**
 * The width of one sample card, cut from the screen it is scrolling across.
 *
 * Two cards, the gap between them, and the leading edge of the next — measured
 * rather than fixed, because a fixed 208 filled a 412dp phone exactly and left
 * nothing hanging over the edge to scroll towards.
 */
export function homeSampleCardWidth(screenWidth: number): number {
  const usable = screenWidth - pagePadding - SAMPLE_GAP * 2 - SAMPLE_PEEK;
  const fitted = Math.floor(usable / 2);
  return Math.min(MAX_SAMPLE_WIDTH, Math.max(MIN_SAMPLE_WIDTH, fitted));
}

/** A sample photo is cut 4:3 in the strip, so the card is a shelf, not a column. */
export function homeSamplePhotoHeight(cardWidth: number): number {
  return Math.round((cardWidth * 3) / 4);
}
