import { ApiError, type Cart, type CartLineRecord, type CatalogItem } from "@/lib/api";

/**
 * A basket already with one shop, and a listing GRIDGO matched to another.
 * Shared by the listing-sheet tests for issue report B057A39C.
 */

export const OTHER_SHOP_ITEM: CatalogItem = {
  id: "sci_flyers",
  supplierId: "user_shop_b",
  supplierServiceId: "svc",
  categoryCode: "marketing_collateral",
  subcategoryCode: "flyers",
  name: "Flyers",
  description: null,
  basePriceMinor: 2200,
  fromPriceMinor: 2200,
  effectivePriceMinor: null,
  pricingUnit: "per_package",
  packageQty: 100,
  measurementKind: "none" as const,
  measureUnit: null,
  minimumWidthMilli: null,
  minimumHeightMilli: null,
  minimumLengthMilli: null,
  minimumOrderQuantity: null,
  priceTiers: [],
  speedTiers: [],
  pricingBasis: "per_unit",
  turnaroundMode: "override",
  turnaroundHours: 12,
  rush: null,
  acceptedFormats: [],
  photos: [],
  prepSteps: [],
  optionGroups: [],
  version: 1,
  serviceVersion: 1,
};

export function basketLine(overrides: Partial<CartLineRecord> & { name: string }): CartLineRecord {
  const { name, ...rest } = overrides;
  return {
    id: `cline_${name.toLowerCase().replace(/\W+/g, "_")}`,
    supplierId: "user_shop_a",
    catalogItemId: `sci_${name.toLowerCase().replace(/\W+/g, "_")}`,
    quantity: 1,
    optionIds: [],
    measurement: null,
    structuredSpec: {},
    artworkFileId: null,
    mockupFileId: null,
    dropoff: null,
    sortOrder: 0,
    listing: { id: "sci", name, supplierId: "user_shop_a" } as unknown as CatalogItem,
    lineSubtotalMinor: 45000,
    ...rest,
  };
}

export function basket(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart_held",
    state: "draft",
    version: 3,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: null,
    lines: [basketLine({ name: "Tarpaulin banner" })],
    checkedOutOrderId: null,
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
    ...overrides,
  };
}

/** What gridgo-api answers a line from a second shop with. */
export function otherShopRefusal(): ApiError {
  return new ApiError(409, {
    error: "cart_belongs_to_another_shop",
    message: "This basket is already with another shop. Check it out, or start a new order for this.",
    field: "catalogItemId",
  });
}

/** The basket GRIDGO starts when the client chooses to begin again. */
export function freshBasketWithFlyers(): Cart {
  return basket({
    id: "cart_fresh",
    version: 1,
    lines: [
      basketLine({
        name: "Flyers",
        id: "cline_new",
        supplierId: "user_shop_b",
        catalogItemId: "sci_flyers",
      }),
    ],
  });
}
