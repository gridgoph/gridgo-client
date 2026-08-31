import type { CatalogItem, ShopBoard } from "@/lib/api";
import { pickListingFor } from "@/lib/shopBoards";

function item(subcategoryCode: string, fromPriceMinor: number): CatalogItem {
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
    photos: [],
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

describe("pickListingFor", () => {
  it("quotes the cheapest listing in that subcategory", () => {
    const boards = [
      board([item("flyers", 50_000), item("flyers", 40_000)]),
    ];
    expect(pickListingFor(boards, "flyers")?.fromPriceMinor).toBe(40_000);
  });

  it("has nothing to quote when no shop lists it", () => {
    expect(pickListingFor([board([item("flyers", 40_000)])], "brochures")).toBeNull();
  });
});
