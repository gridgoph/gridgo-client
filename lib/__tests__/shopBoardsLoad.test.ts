import type { ShopBoard, ShopSummary } from "@/lib/api";
import {
  clearBoardCache,
  loadCategoryBoards,
  MAX_BOARDS,
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

/** A directory of `count` approved boards where only the last one lists flyers. */
function directory(count: number) {
  api.listCatalogShops.mockResolvedValue(Array.from({ length: count }, (_, index) => shop(index)));
  api.getCatalogShop.mockImplementation(async (supplierId: string) => {
    const index = Number(supplierId.split("_")[1]);
    return board(supplierId, index === count - 1 ? "flyers" : "tarpaulins_outdoor_banners");
  });
}

beforeEach(() => {
  clearBoardCache();
  api.getCatalogShop.mockReset();
  api.listCatalogShops.mockReset();
});

describe("loadCategoryBoards", () => {
  it("reads one whole page of the shop list", () => {
    // `GET /catalog/shops` pages at 20; twelve stopped short of it.
    expect(MAX_BOARDS).toBe(20);
  });

  it("reads board 13, so a product listed only there is on a press", async () => {
    directory(13);
    const read = await loadCategoryBoards("marketing_collateral");

    expect(api.getCatalogShop).toHaveBeenCalledTimes(13);
    expect(read.boards).toHaveLength(13);
    expect(orderableSubcategories(read.boards).has("flyers")).toBe(true);
  });

  it("still stops at the cap on a longer directory", async () => {
    directory(MAX_BOARDS + 5);
    const read = await loadCategoryBoards("marketing_collateral");

    expect(api.getCatalogShop).toHaveBeenCalledTimes(MAX_BOARDS);
    expect(read.boards).toHaveLength(MAX_BOARDS);
  });
});
