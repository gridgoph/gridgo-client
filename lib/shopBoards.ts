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
import { canonicalCategoryCode } from "@/lib/productCategories";

export type CategoryBoards = {
  categoryCode: string;
  shops: api.ShopSummary[];
  boards: api.ShopBoard[];
  /**
   * Boards listed but not read, counted rather than dropped. Each is "Board N"
   * by its place in the listing — never a shop's name, which client reads stop
   * carrying (gridgo-api#132).
   */
  unreadable: string[];
  /**
   * Boards listed and still being read. Non-zero only on the early answer
   * `onFirstWave` hands over while the rest of a long directory is read.
   */
  pending: number;
  /**
   * The directory itself stopped short: its page cap was reached with more
   * shops still listed, so boards exist that this read never saw.
   */
  truncated: boolean;
};

/**
 * Whether a read covers every listed board. Only then can a screen say a
 * subcategory is on no press: a board still to come, or one that failed, may
 * be the one that lists it.
 */
export function boardsComplete(
  read: Pick<CategoryBoards, "unreadable" | "pending" | "truncated">,
): boolean {
  return read.pending === 0 && read.unreadable.length === 0 && !read.truncated;
}

/** A finished read that still cannot say a product is on no press. */
export function boardsShort(read: Pick<CategoryBoards, "unreadable" | "truncated">): boolean {
  return read.unreadable.length > 0 || read.truncated;
}

type Entry = { at: number; value: Promise<CategoryBoards> };

const cache = new Map<string, Entry>();

/** Long enough to cross two screens, short enough to notice a taken-down listing. */
export const BOARDS_TTL_MS = 60_000;

/**
 * How many boards are read together before anything is drawn.
 *
 * The first wave is what the screen waits on, so it is read all at once, as
 * it always was. A directory longer than that is read to the end behind it —
 * a category screen that stopped at twelve boards told clients a product on
 * board thirteen was on no press (ux-findings-1030 #3).
 */
export const FIRST_WAVE_BOARDS = 12;

/** Boards in flight at once after the first wave: never the whole directory. */
export const BOARD_CONCURRENCY = 6;

type LoadOptions = {
  force?: boolean;
  /**
   * Called once with the first wave's boards when more are still being read,
   * so a long directory paints as soon as a short one would. Not called on a
   * cached answer, which is already whole.
   */
  onFirstWave?: (partial: CategoryBoards) => void;
};

/**
 * Every shop's board, for one category or — with an empty code — for all of
 * them.
 */
export async function loadCategoryBoards(
  categoryCode: string,
  { force = false, onFirstWave }: LoadOptions = {},
): Promise<CategoryBoards> {
  const key = categoryCode;
  const held = cache.get(key);
  if (!force && held && Date.now() - held.at < BOARDS_TTL_MS) return held.value;

  const value = read(categoryCode, onFirstWave);
  cache.set(key, { at: Date.now(), value });
  // A failed read must not be cached, or one flaky moment breaks the category
  // for the next minute — and neither is a read with a board missing, or the
  // retry that answers it would be served the same gap.
  const drop = () => {
    if (cache.get(key)?.value === value) cache.delete(key);
  };
  value.then((result) => {
    if (boardsShort(result)) drop();
  }, drop);
  return value;
}

async function read(
  categoryCode: string,
  onFirstWave?: (partial: CategoryBoards) => void,
): Promise<CategoryBoards> {
  const directory = await api.listCatalogShops(
    canonicalCategoryCode(categoryCode) || categoryCode,
  );
  const shops = directory.shops;
  const truncated = !directory.complete;
  const results: (api.ShopBoard | null)[] = new Array(shops.length).fill(null);
  const readOne = async (index: number) => {
    try {
      results[index] = await api.getCatalogShop(shops[index].supplierId);
    } catch {
      results[index] = null;
    }
  };

  const firstWave = Math.min(FIRST_WAVE_BOARDS, shops.length);
  await Promise.all(Array.from({ length: firstWave }, (_, index) => readOne(index)));
  if (firstWave === shops.length) {
    return settle(categoryCode, shops, results, shops.length, truncated);
  }

  onFirstWave?.(settle(categoryCode, shops, results, firstWave, truncated));

  let next = firstWave;
  const worker = async () => {
    while (next < shops.length) {
      const index = next;
      next += 1;
      await readOne(index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(BOARD_CONCURRENCY, shops.length - firstWave) }, worker),
  );
  return settle(categoryCode, shops, results, shops.length, truncated);
}

/** The answer so far, from the first `readCount` boards of the directory. */
function settle(
  categoryCode: string,
  shops: api.ShopSummary[],
  results: (api.ShopBoard | null)[],
  readCount: number,
  truncated: boolean,
): CategoryBoards {
  const boards: api.ShopBoard[] = [];
  const unreadable: string[] = [];
  for (let index = 0; index < readCount; index += 1) {
    const board = results[index];
    if (board) boards.push(board);
    else unreadable.push(`Board ${index + 1}`);
  }
  return {
    categoryCode,
    shops,
    boards,
    unreadable,
    pending: shops.length - readCount,
    truncated,
  };
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
    .sort((left, right) => fromPriceKey(left) - fromPriceKey(right));
}

/**
 * What "cheapest" is measured on: GRIDGO's starting price where the listing
 * carries it, else the shop's. One markup for every listing, so the order is
 * the same either way — but a client surface sorts on the figure it draws.
 */
export function fromPriceKey(
  item: Pick<api.CatalogItem, "fromPriceMinor" | "clientFromPriceMinor">,
): number {
  return Number.isSafeInteger(item.clientFromPriceMinor)
    ? (item.clientFromPriceMinor as number)
    : item.fromPriceMinor;
}

/**
 * The listing a category tile quotes: cheapest first, which is the "From"
 * price. Same listing as the photo — a cheaper listing with no sample is still
 * the honest starting price, and the frame says so when it is empty.
 */
export function pickListingFor(
  boards: api.ShopBoard[],
  subcategoryCode: string,
): api.CatalogItem | null {
  const items = boards.flatMap((board) => listingsFor(board, subcategoryCode));
  return items[0] ?? null;
}

/** How many shops list one subcategory, for the "see next shop" count. */
export function shopsListing(boards: api.ShopBoard[], subcategoryCode: string): number {
  return boards.filter((board) =>
    board.services.some((service) =>
      service.items.some((item) => item.subcategoryCode === subcategoryCode),
    ),
  ).length;
}
