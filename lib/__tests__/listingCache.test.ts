import type { Cart, CatalogItem } from "@/lib/api";
import {
  clearListingCache,
  hydrateCartListings,
  LISTING_TTL_MS,
  listingNow,
  rememberListing,
  takeListing,
} from "@/lib/listingCache";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getCatalogItem: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

function item(id: string, name = "Flyers"): CatalogItem {
  return {
    id,
    supplierId: "s",
    supplierServiceId: "svc",
    categoryCode: "marketing_collateral",
    subcategoryCode: "flyers",
    name,
    description: null,
    basePriceMinor: 2500,
    fromPriceMinor: 2500,
    effectivePriceMinor: null,
    pricingUnit: "per_package",
    packageQty: 100,
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

beforeEach(() => {
  clearListingCache();
  api.getCatalogItem.mockReset();
  jest.restoreAllMocks();
});

describe("listing cache", () => {
  it("returns a remembered listing without waiting on the network", async () => {
    rememberListing(item("sci_1"));
    api.getCatalogItem.mockReturnValue(new Promise(() => {}));

    await expect(takeListing("sci_1")).resolves.toMatchObject({ id: "sci_1", name: "Flyers" });
    expect(listingNow("sci_1")?.name).toBe("Flyers");
    // Match already signed the sample. Hitting GET here is the slow sheet open.
    expect(api.getCatalogItem).not.toHaveBeenCalled();
  });

  it("reads the network when nothing is remembered", async () => {
    api.getCatalogItem.mockResolvedValue(item("sci_2", "A3 flyers"));
    await expect(takeListing("sci_2")).resolves.toMatchObject({ name: "A3 flyers" });
    expect(listingNow("sci_2")?.name).toBe("A3 flyers");
  });

  it("keeps a stale listing on screen while a refresh is still in flight", async () => {
    const now = 1_000_000;
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(now);
    rememberListing(item("sci_1"));
    nowSpy.mockReturnValue(now + LISTING_TTL_MS + 1);
    api.getCatalogItem.mockReturnValue(new Promise(() => {}));

    await expect(takeListing("sci_1")).resolves.toMatchObject({ name: "Flyers" });
    expect(api.getCatalogItem).toHaveBeenCalledTimes(1);
  });

  it("fills a compact cart line from the listing the sheet already holds", () => {
    rememberListing(item("sci_1"));
    const cart = {
      id: "cart_1",
      state: "draft" as const,
      version: 1,
      serviceLevel: "standard" as const,
      scheduledFor: null,
      fulfillmentMode: "delivery" as const,
      defaultDropoff: null,
      checkedOutOrderId: null,
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
      lines: [
        {
          id: "cline_new",
          supplierId: "s",
          catalogItemId: "sci_1",
          quantity: 1,
          optionIds: [],
          structuredSpec: {},
          artworkFileId: null,
          mockupFileId: null,
          dropoff: null,
          sortOrder: 0,
          listing: {
            id: "sci_1",
            name: "Flyers",
            supplierId: "s",
            fromPriceMinor: 2500,
            effectivePriceMinor: 2500,
            selectedOptions: [],
          } as unknown as CatalogItem,
          lineSubtotalMinor: 2500,
        },
      ],
    } satisfies Cart;

    expect(hydrateCartListings(cart).lines[0].listing?.name).toBe("Flyers");
    expect(hydrateCartListings(cart).lines[0].listing?.optionGroups).toEqual([]);
  });
});
