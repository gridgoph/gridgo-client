/**
 * What Home shows a client who has nothing on press.
 *
 * A first-run Home used to be a category menu and nothing else, which answers
 * "what would you like to order?" without ever showing the client a single
 * thing GRIDGO has printed. This picks a few real listings off the shops'
 * boards so the first screen carries actual work at actual starting prices.
 *
 * Two rules decide the picks, and both are about what the strip is for.
 *
 * **One per family, in the tree's own order.** A strip of five flyers says
 * GRIDGO prints flyers. Spreading it says GRIDGO prints marketing, merch,
 * awards, prototypes and paperwork — which is the thing a new client does not
 * yet know. Only once every family has had a turn does a second pick from any
 * of them appear.
 *
 * **A photo wins over a lower price.** These are samples: a card with no
 * photograph is a grey plate, and three grey plates are worse than two good
 * ones. Within a family the cheapest listing that carries a sample is taken,
 * so the "From" price on the card is still the honest starting price of the
 * listing shown — never one listing's photo over another's number.
 *
 * The shop is deliberately absent. GRIDGO is the counter (`lib/gridgoOffice.ts`),
 * so a pick carries the work and its price and never the press that listed it.
 */

import { pagePadding, spacing } from "@/constants/theme";
import type { CatalogItem, ShopBoard } from "@/lib/api";
import { samplePhotoUri } from "@/lib/listing";
import type { ProductCategory, ProductSubcategory } from "@/lib/productCategories";
import { listingsFor } from "@/lib/shopBoards";

export type HomeSample = {
  category: ProductCategory;
  subcategory: ProductSubcategory;
  listing: CatalogItem;
};

/** How many samples the strip carries. Enough to scroll, few enough to read. */
export const HOME_SAMPLE_LIMIT = 6;

/**
 * The cheapest listing for a subcategory that has a sample photo, falling back
 * to the cheapest listing at all.
 *
 * `listingsFor` already sorts by price, so "first with a photo" is "cheapest
 * with a photo" and no second sort is needed.
 */
function pickListing(boards: ShopBoard[], subcategoryCode: string): CatalogItem | null {
  const items = boards.flatMap((board) => listingsFor(board, subcategoryCode));
  return items.find((item) => samplePhotoUri(item.photos[0])) ?? items[0] ?? null;
}

/** Every subcategory of one category that a shop lists today, cheapest first. */
function candidatesIn(category: ProductCategory, boards: ShopBoard[]): HomeSample[] {
  return category.subcategories
    .map((subcategory) => {
      const listing = pickListing(boards, subcategory.code);
      return listing ? { category, subcategory, listing } : null;
    })
    .filter((entry): entry is HomeSample => entry !== null)
    .sort((left, right) =>
      left.listing.fromPriceMinor - right.listing.fromPriceMinor,
    );
}

/**
 * A few things GRIDGO prints today, spread across the families.
 *
 * Returns an empty list when no shop lists anything readable — Home draws no
 * strip at all then, rather than an empty shelf. A category the API added and
 * this app has no boards for simply contributes nothing.
 */
export function pickHomeSamples(
  categories: ProductCategory[],
  boards: ShopBoard[],
  limit: number = HOME_SAMPLE_LIMIT,
): HomeSample[] {
  if (limit <= 0) return [];

  // One queue per family, so taking the head of each in turn is the round the
  // strip is built from.
  const queues = categories.map((category) => candidatesIn(category, boards));

  const picked: HomeSample[] = [];
  let tookOne = true;
  while (picked.length < limit && tookOne) {
    tookOne = false;
    for (const queue of queues) {
      if (picked.length >= limit) break;
      const next = queue.shift();
      if (!next) continue;
      picked.push(next);
      tookOne = true;
    }
  }
  return picked;
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
