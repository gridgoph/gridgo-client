import type { Cart, CatalogItem } from "@/lib/api";
import { fileFormats } from "@/lib/listing";
import {
  clearListingCache,
  holdSheetListing,
  hydrateCartListings,
  LISTING_TTL_MS,
  listingNow,
  listingTrusted,
  rememberListing,
  replaceListing,
  takeListing,
  withLineListing,
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

  it("paints another shop's anonymous listing at once, but reads the full sheet behind it", async () => {
    rememberListing({ ...item("sci_other"), description: null, prepSteps: [] }, { partial: true });
    api.getCatalogItem.mockResolvedValue({
      ...item("sci_other"),
      description: "Weather-resistant inks.",
    });

    // Painted from the match straight away...
    expect(listingNow("sci_other")?.name).toBe("Flyers");
    // ...but not trusted as the whole listing: the sheet waits on the read.
    await expect(takeListing("sci_other")).resolves.toMatchObject({
      description: "Weather-resistant inks.",
    });
    expect(api.getCatalogItem).toHaveBeenCalledWith("sci_other");
    expect(listingNow("sci_other")?.description).toBe("Weather-resistant inks.");
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
          measurement: null,
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

it("keeps an invalidated read from replacing cache or removing a newer read", async () => {
  let old!: (value: CatalogItem) => void;
  let fresh!: (value: CatalogItem) => void;
  api.getCatalogItem.mockReturnValueOnce(new Promise((resolve) => { old = resolve; }));
  const first = takeListing("sci_1");
  const rejected = expect(first).rejects.toThrow("listing changed");
  clearListingCache();
  api.getCatalogItem.mockReturnValueOnce(new Promise((resolve) => { fresh = resolve; }));
  const second = takeListing("sci_1");
  old(item("sci_1", "Old price"));
  await rejected;
  expect(listingNow("sci_1")).toBeNull();
  const third = takeListing("sci_1");
  expect(api.getCatalogItem).toHaveBeenCalledTimes(2);
  fresh(item("sci_1", "New price"));
  await Promise.all([second, third]);
  expect(listingNow("sci_1")?.name).toBe("New price");
});

it("lets a pending server read replace an old match snapshot", async () => {
  let finish!: (value: CatalogItem) => void;
  api.getCatalogItem.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const pending = takeListing("sci_1");
  rememberListing(item("sci_1", "Old match snapshot"));
  finish(item("sci_1", "New server listing"));
  await expect(pending).resolves.toMatchObject({ name: "New server listing" });
  expect(listingNow("sci_1")?.name).toBe("New server listing");
});

const PDF = {
  code: "pdf",
  displayName: "PDF",
  inputKind: "file" as const,
  extensions: ["pdf"],
  mimeTypes: ["application/pdf"],
  active: true,
};

/** The listing gridgo-api's `publicCartListingStub` puts on a line add: no formats, photos or options. */
function stub(id: string): CatalogItem {
  return { id, name: "Tarpaulin", supplierId: "s", selectedOptions: [] } as unknown as CatalogItem;
}

function cartWith(listing: CatalogItem, lineId = "cline_new"): Cart {
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: null,
    checkedOutOrderId: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    lines: [
      {
        id: lineId,
        supplierId: "s",
        catalogItemId: listing.id,
        quantity: 1,
        optionIds: [],
        measurement: null,
        structuredSpec: {},
        artworkFileId: null,
        mockupFileId: null,
        dropoff: null,
        sortOrder: 0,
        listing,
        lineSubtotalMinor: 2500,
      },
    ],
  };
}

describe("the add's listing stub (the Artwork crash)", () => {
  const full = { ...item("sci_tarp", "Tarpaulin"), acceptedFormats: [PDF] };

  it("leaves the stub on the line once the alert stream has emptied the cache", () => {
    rememberListing(full);
    clearListingCache();
    const line = hydrateCartListings(cartWith(stub("sci_tarp"))).lines[0];
    expect(line.listing).toEqual(stub("sci_tarp"));
    // What used to throw "Cannot read property 'filter' of undefined".
    expect(fileFormats(line.listing!)).toEqual([]);
  });

  it("draws the line from the sheet held just before the add, whatever cleared the cache", () => {
    rememberListing(full);
    clearListingCache();
    holdSheetListing(full);
    const line = hydrateCartListings(cartWith(stub("sci_tarp"))).lines[0];
    expect(fileFormats(line.listing!)).toEqual([PDF]);
  });

  it("keeps a copy already held, and marks its own as partial so the next sheet still reads in full", async () => {
    holdSheetListing(full);
    holdSheetListing({ ...full, name: "Older copy" });
    expect(listingNow("sci_tarp")?.name).toBe("Tarpaulin");
    api.getCatalogItem.mockResolvedValueOnce({ ...full, description: "Full sheet" });
    await expect(takeListing("sci_tarp")).resolves.toMatchObject({ description: "Full sheet" });
  });

  it("does not trust a listing whose sheet threw again because the add held it", async () => {
    api.getCatalogItem.mockReturnValueOnce(new Promise(() => undefined));
    void replaceListing("sci_tarp");
    holdSheetListing(full);
    expect(listingNow("sci_tarp")).toBeNull();
    expect(listingTrusted("sci_tarp")).toBe(false);
  });

  it("puts a fresh read on every line of that product, replacing a full copy too", () => {
    const fresh = { ...full, name: "Fresh read" };
    const cart = cartWith(full);
    expect(withLineListing(cart, fresh).lines[0].listing).toBe(fresh);
    expect(withLineListing(cart, item("sci_other"))).toBe(cart);
  });
});
