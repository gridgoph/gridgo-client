import type { ShopBoard, ShopSummary } from "@/lib/api";
import {
  boardsComplete,
  clearBoardCache,
  FIRST_WAVE_BOARDS,
  loadCategoryBoards,
  orderableSubcategories,
} from "@/lib/shopBoards";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listCatalogShops: jest.fn(),
  getCatalogShop: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

function shop(index: number): ShopSummary {
  return {
    supplierId: `shop_${index}`,
    shopName: `Test studio ${index}`,
    shop: null,
    media: [],
    categories: ["marketing_collateral"],
  } as unknown as ShopSummary;
}

function board(supplierId: string, subcategoryCode: string): ShopBoard {
  return {
    supplierId,
    shopName: "Test studio",
    shop: null,
    media: [],
    categories: ["marketing_collateral"],
    services: [
      {
        id: `svc_${supplierId}`,
        version: 1,
        categoryCode: "marketing_collateral",
        pricingBasis: "per_unit",
        turnaroundHours: 48,
        acceptedFormats: [],
        items: [{ id: `item_${supplierId}`, subcategoryCode }],
      },
    ],
  } as unknown as ShopBoard;
}

/**
 * A directory of `count` approved boards where only the last one lists flyers,
 * read with a delay so the test can see how many reads are in flight at once.
 */
function directory(count: number, failing: Set<number> = new Set()) {
  const shops = Array.from({ length: count }, (_, index) => shop(index));
  let inFlight = 0;
  let peak = 0;
  api.listCatalogShops.mockResolvedValue(shops);
  api.getCatalogShop.mockImplementation(async (supplierId: string) => {
    const index = Number(supplierId.split("_")[1]);
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    if (failing.has(index)) throw new Error("Network request failed");
    return board(supplierId, index === count - 1 ? "flyers" : "tarpaulins_outdoor_banners");
  });
  return { peak: () => peak };
}

beforeEach(() => {
  clearBoardCache();
  api.getCatalogShop.mockReset();
  api.listCatalogShops.mockReset();
});

describe("loadCategoryBoards", () => {
  it("reads past the first twelve boards, so a product on board 13 is on a press", async () => {
    const reads = directory(13);
    const read = await loadCategoryBoards("marketing_collateral");

    expect(read.boards).toHaveLength(13);
    expect(orderableSubcategories(read.boards).has("flyers")).toBe(true);
    expect(boardsComplete(read)).toBe(true);
    expect(reads.peak()).toBeLessThanOrEqual(FIRST_WAVE_BOARDS);
  });

  it.each([1, 12, 13, 30])(
    "reads each of %i boards once, never all at once",
    async (count) => {
      const reads = directory(count);
      const read = await loadCategoryBoards("marketing_collateral");

      expect(api.listCatalogShops).toHaveBeenCalledTimes(1);
      expect(api.getCatalogShop).toHaveBeenCalledTimes(count);
      expect(read.boards).toHaveLength(count);
      expect(reads.peak()).toBeLessThanOrEqual(Math.min(count, FIRST_WAVE_BOARDS));
    },
  );

  it("hands over the first wave early when more boards are still coming", async () => {
    directory(30);
    const onFirstWave = jest.fn();
    const read = await loadCategoryBoards("marketing_collateral", { onFirstWave });

    expect(onFirstWave).toHaveBeenCalledTimes(1);
    const partial = onFirstWave.mock.calls[0][0];
    expect(partial.boards).toHaveLength(FIRST_WAVE_BOARDS);
    expect(partial.pending).toBe(30 - FIRST_WAVE_BOARDS);
    expect(boardsComplete(partial)).toBe(false);
    expect(read.pending).toBe(0);
  });

  it("does not call a short directory early: there is nothing more to wait for", async () => {
    directory(12);
    const onFirstWave = jest.fn();
    await loadCategoryBoards("marketing_collateral", { onFirstWave });

    expect(onFirstWave).not.toHaveBeenCalled();
  });

  it("names a failed board rather than reading the gap as no listing", async () => {
    directory(13, new Set([12]));
    const read = await loadCategoryBoards("marketing_collateral");

    expect(read.unreadable).toEqual(["Board 13"]);
    expect(boardsComplete(read)).toBe(false);
  });

  it("does not hold a read with a missing board, so a retry reads again", async () => {
    directory(13, new Set([12]));
    await loadCategoryBoards("marketing_collateral");
    await new Promise((resolve) => setTimeout(resolve, 0));

    directory(13);
    const retried = await loadCategoryBoards("marketing_collateral");
    expect(boardsComplete(retried)).toBe(true);
  });

  it("serves a whole read from the cache within the minute", async () => {
    directory(13);
    await loadCategoryBoards("marketing_collateral");
    await loadCategoryBoards("marketing_collateral");

    expect(api.listCatalogShops).toHaveBeenCalledTimes(1);
  });
});
