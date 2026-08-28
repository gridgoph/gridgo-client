/**
 * Reading every shop's board for one category, once.
 *
 * The public catalog is two calls deep: a list of approved shops, then each
 * shop's own board. Both the category screen (which subcategories can be
 * ordered today?) and the match screen (which shop, and what does it list?)
 * need the same answer, seconds apart, so asking twice would cost a client on
 * mobile data twice for nothing.
 *
 * The cache is in memory and short-lived. A shop can take a listing down, and a
 * board held for the length of a session would keep offering it — so it is held
 * only long enough to carry a client from choosing what to print to seeing who
 * prints it, and every screen that shows a price re-reads it on focus.
 */

import * as api from "@/lib/api";

export type CategoryBoards = {
  categoryCode: string;
  shops: api.ShopSummary[];
  boards: api.ShopBoard[];
  /** Shops listed but whose board could not be read. Named, never dropped. */
  unreadable: string[];
};

type Entry = { at: number; value: Promise<CategoryBoards> };

const cache = new Map<string, Entry>();

/** Long enough to cross two screens, short enough to notice a taken-down listing. */
export const BOARDS_TTL_MS = 60_000;

/**
 * How many shops' boards are read at once.
 *
 * The list route pages at 20. Reading every board on a browse screen would be
 * twenty round trips before anything is drawn, so the first page is capped and
 * the cap is stated wherever it could hide a shop — the match screen says how
 * many shops it looked at.
 */
export const MAX_BOARDS = 12;

export async function loadCategoryBoards(
  categoryCode: string,
  { force = false }: { force?: boolean } = {},
): Promise<CategoryBoards> {
  const held = cache.get(categoryCode);
  if (!force && held && Date.now() - held.at < BOARDS_TTL_MS) return held.value;

  const value = read(categoryCode);
  cache.set(categoryCode, { at: Date.now(), value });
  // A failed read must not be cached, or one flaky moment breaks the category
  // for the next minute.
  value.catch(() => cache.delete(categoryCode));
  return value;
}

async function read(categoryCode: string): Promise<CategoryBoards> {
  const shops = await api.listCatalogShops(categoryCode);
  const page = shops.slice(0, MAX_BOARDS);

  const results = await Promise.all(
    page.map(async (shop) => {
      try {
        return await api.getCatalogShop(shop.supplierId);
      } catch {
        return null;
      }
    }),
  );

  const boards: api.ShopBoard[] = [];
  const unreadable: string[] = [];
  results.forEach((board, index) => {
    if (board) boards.push(board);
    else unreadable.push(page[index].shopName);
  });

  return { categoryCode, shops, boards, unreadable };
}

/** Drop everything held, e.g. after signing out. */
export function clearBoardCache(): void {
  cache.clear();
}

/** Subcategory codes at least one shop in this category lists today. */
export function orderableSubcategories(boards: api.ShopBoard[]): Set<string> {
  const codes = new Set<string>();
  for (const board of boards) {
    for (const service of board.services) {
      for (const item of service.items) codes.add(item.subcategoryCode);
    }
  }
  return codes;
}

/**
 * Every listing on one board for one subcategory, cheapest first.
 * A shop with none cannot print it and is not a candidate at all.
 */
export function listingsFor(
  board: api.ShopBoard,
  subcategoryCode: string,
): api.CatalogItem[] {
  return board.services
    .flatMap((service) => service.items)
    .filter((item) => item.subcategoryCode === subcategoryCode)
    .sort((left, right) => left.fromPriceMinor - right.fromPriceMinor);
}

/** How many shops list one subcategory, for the "see next shop" count. */
export function shopsListing(boards: api.ShopBoard[], subcategoryCode: string): number {
  return boards.filter((board) =>
    board.services.some((service) =>
      service.items.some((item) => item.subcategoryCode === subcategoryCode),
    ),
  ).length;
}
