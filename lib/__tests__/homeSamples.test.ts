import type { CatalogItem, CatalogPhoto, ShopBoard } from "@/lib/api";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import { pagePadding } from "@/constants/theme";
import {
  SAMPLE_GAP,
  SAMPLE_PEEK,
  homeSampleCardWidth,
  homeSamplePhotoHeight,
  pickHomeSamples,
} from "@/lib/homeSamples";

function photo(): CatalogPhoto {
  return {
    fileId: "file_1",
    sortOrder: 0,
    altText: "A printed sample",
    url: "/catalog/media/file_1",
    downloadUrl: "https://storage.example/file_1",
  };
}

function item(
  subcategoryCode: string,
  fromPriceMinor: number,
  photos: CatalogPhoto[] = [],
): CatalogItem {
  return {
    id: `sci_${subcategoryCode}_${fromPriceMinor}`,
    supplierId: "user_shop",
    supplierServiceId: "svc",
    categoryCode: "marketing_collateral",
    subcategoryCode,
    name: subcategoryCode,
    description: null,
    basePriceMinor: fromPriceMinor,
    fromPriceMinor,
    effectivePriceMinor: null,
    pricingUnit: "per_unit",
    packageQty: null,
    measurementKind: "none",
    measureUnit: null,
    minimumWidthMilli: null,
    minimumHeightMilli: null,
    minimumLengthMilli: null,
    minimumOrderQuantity: null,
    priceTiers: [],
    speedTiers: [],
    pricingBasis: "per_unit",
    turnaroundMode: "override",
    turnaroundHours: 48,
    rush: null,
    acceptedFormats: [],
    photos,
    prepSteps: [],
    optionGroups: [],
    version: 1,
    serviceVersion: 1,
  };
}

function board(items: CatalogItem[]): ShopBoard {
  return {
    supplierId: "user_shop",
    shopName: "Shop",
    shop: null,
    media: [],
    categories: ["marketing_collateral"],
    services: [
      {
        id: "svc",
        version: 1,
        categoryCode: "marketing_collateral",
        pricingBasis: "per_unit",
        turnaroundHours: 48,
        acceptedFormats: [],
        items,
      },
    ],
  };
}

describe("pickHomeSamples", () => {
  /**
   * The strip exists to tell a brand-new client what GRIDGO makes. Five cards
   * from one family says "GRIDGO prints flyers", which is the opposite.
   */
  it("gives every family a turn before any family gets a second card", () => {
    const boards = [
      board([
        item("flyers", 10_000),
        item("brochures", 11_000),
        item("business_cards", 12_000),
        item("custom_apparel", 50_000),
        item("certificates_diplomas", 30_000),
      ]),
    ];

    const picked = pickHomeSamples(PRODUCT_CATEGORY_SEED, boards, 4);
    const families = picked.map((entry) => entry.category.code);

    expect(families.slice(0, 3)).toEqual([
      "marketing_collateral",
      "corporate_event_merch",
      "recognition_awards_signage",
    ]);
    // Only marketing has anything left, so the fourth card is its second.
    expect(families[3]).toBe("marketing_collateral");
  });

  /**
   * These are sample cards. A listing with no photograph draws a grey plate,
   * so within a family the cheapest one that has a sample wins — and the price
   * on the card is that listing's own, never one listing's photo over
   * another's number.
   */
  it("prefers a listing that has a sample photo over a cheaper blank one", () => {
    const boards = [board([item("flyers", 4_000), item("flyers", 9_000, [photo()])])];

    const picked = pickHomeSamples(PRODUCT_CATEGORY_SEED, boards, 1);

    expect(picked).toHaveLength(1);
    expect(picked[0].listing.fromPriceMinor).toBe(9_000);
    expect(picked[0].subcategory.name).toBe("Flyers");
  });

  it("falls back to a blank listing when no shop has photographed one", () => {
    const boards = [board([item("flyers", 4_000)])];

    expect(pickHomeSamples(PRODUCT_CATEGORY_SEED, boards, 1)[0].listing.fromPriceMinor).toBe(
      4_000,
    );
  });

  it("stops at the limit", () => {
    const boards = [
      board([item("flyers", 10_000), item("brochures", 11_000), item("custom_apparel", 50_000)]),
    ];

    expect(pickHomeSamples(PRODUCT_CATEGORY_SEED, boards, 2)).toHaveLength(2);
    expect(pickHomeSamples(PRODUCT_CATEGORY_SEED, boards, 0)).toEqual([]);
  });

  /** No boards is no strip — Home draws nothing rather than an empty shelf. */
  it("has nothing to show when no shop lists anything", () => {
    expect(pickHomeSamples(PRODUCT_CATEGORY_SEED, [])).toEqual([]);
    expect(pickHomeSamples(PRODUCT_CATEGORY_SEED, [board([])])).toEqual([]);
  });

  /** A family the API added that this app has no listings for contributes none. */
  it("skips a category no shop prints", () => {
    const boards = [board([item("flyers", 10_000)])];

    const picked = pickHomeSamples(PRODUCT_CATEGORY_SEED, boards);

    expect(picked).toHaveLength(1);
    expect(picked[0].category.code).toBe("marketing_collateral");
  });
});


/**
 * A strip that ends flush with the screen edge reads as the whole shelf. The
 * card after next has to hang over the edge, or nobody scrolls it.
 */
describe("homeSampleCardWidth", () => {
  it("leaves the next card hanging over the screen edge", () => {
    for (const screenWidth of [360, 393, 412, 430]) {
      const card = homeSampleCardWidth(screenWidth);
      const twoCards = pagePadding + card + SAMPLE_GAP + card;
      expect(screenWidth - twoCards).toBeGreaterThanOrEqual(SAMPLE_GAP);
    }
  });

  it("keeps a card readable on a narrow phone and sane on a tablet", () => {
    expect(homeSampleCardWidth(320)).toBeGreaterThanOrEqual(148);
    expect(homeSampleCardWidth(1024)).toBeLessThanOrEqual(200);
  });

  it("cuts the strip's sample 4:3, so the card is a shelf and not a column", () => {
    expect(homeSamplePhotoHeight(160)).toBe(120);
  });
});
