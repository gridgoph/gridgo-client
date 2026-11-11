import { pagePadding } from "@/constants/theme";
import {
  FEATURED_GAP,
  featuredCardWidth,
  featuredImageHeight,
  featuredPrintsFrom,
  featuredSnapInterval,
  keepHeldFeatured,
  sameFeaturedPrints,
} from "@/lib/homeSamples";

/** One card as gridgo-api's `GET /featured-prints` sends it. */
function card(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: "Flyers",
    categoryCode: "marketing_collateral",
    subcategoryCode: "flyers",
    clientFromPriceMinor: 1100,
    pricingUnit: "per_unit",
    packageQty: null,
    measureUnit: null,
    minimumOrderQuantity: null,
    photos: [
      {
        fileId: "file_sample",
        sortOrder: 0,
        url: "/catalog/media/file_sample",
        downloadUrl: "https://storage.example/signed-sample",
        downloadUrlExpiresAt: "2026-10-15T00:05:00.000Z",
      },
    ],
    ...overrides,
  };
}

/**
 * FEATURED PRINTS is GRIDGO's curated list, drawn as sent. Nothing here may
 * add to it, reorder it, or reach for a shop.
 */
describe("featuredPrintsFrom", () => {
  it("keeps the staff order and GRIDGO's own price", () => {
    const read = featuredPrintsFrom({
      title: "FEATURED PRINTS",
      items: [card("sci_card", { name: "Calling cards", clientFromPriceMinor: 44_000 }), card("sci_flyer")],
      emptyState: null,
    });

    expect(read.map((entry) => entry.id)).toEqual(["sci_card", "sci_flyer"]);
    expect(read[0]).toMatchObject({ name: "Calling cards", clientFromPriceMinor: 44_000 });
    expect(read[1].photos[0].downloadUrl).toBe("https://storage.example/signed-sample");
  });

  /** The contract's empty answer is no row; Home keeps its start board. */
  it("is empty for the contract's empty state and for a body it cannot read", () => {
    expect(
      featuredPrintsFrom({
        title: "FEATURED PRINTS",
        items: [],
        emptyState: { action: "browse_catalog", message: "Explore print products to start your first print." },
      }),
    ).toEqual([]);
    expect(featuredPrintsFrom(null)).toEqual([]);
    expect(featuredPrintsFrom({ items: "nope" })).toEqual([]);
  });

  it("drops a card it cannot start or price, and a repeat", () => {
    const read = featuredPrintsFrom({
      items: [
        card("sci_flyer"),
        card("sci_flyer"),
        card("sci_free", { clientFromPriceMinor: null }),
        card("sci_half", { clientFromPriceMinor: 10.5 }),
        card("sci_lost", { subcategoryCode: "" }),
        "not a card",
      ],
    });

    expect(read.map((entry) => entry.id)).toEqual(["sci_flyer"]);
  });

  /** Signing can be down: the card stays and draws the neutral sample plate. */
  it("keeps a card whose photo link is not signed", () => {
    const read = featuredPrintsFrom({
      items: [card("sci_flyer", { photos: [{ fileId: "file_sample", sortOrder: 0, url: "/catalog/media/file_sample" }] })],
    });

    expect(read).toHaveLength(1);
    expect(read[0].photos[0].downloadUrl).toBeUndefined();
  });

  /** An allowlist card in, an allowlist card out: nothing extra rides along. */
  it("carries no shop field even when one is sent", () => {
    const [read] = featuredPrintsFrom({
      items: [card("sci_flyer", { supplierId: "user_shop", shopName: "A press", fromPriceMinor: 1000 })],
    });

    expect(Object.keys(read).sort()).toEqual(
      [
        "categoryCode",
        "clientFromPriceMinor",
        "id",
        "measureUnit",
        "minimumOrderQuantity",
        "name",
        "packageQty",
        "photos",
        "pricingUnit",
        "subcategoryCode",
      ].sort(),
    );
  });
});

/**
 * A row that ends flush with the screen edge reads as the whole shelf. About
 * 2.3 cards show at rest on every phone: two whole cards and the cut third.
 */
describe("featuredCardWidth", () => {
  it("shows two whole cards and about a third of the next on every phone", () => {
    for (const screenWidth of [360, 390, 393, 412, 430]) {
      const width = featuredCardWidth(screenWidth);
      const peek = screenWidth - (pagePadding + width + FEATURED_GAP + width + FEATURED_GAP);
      expect(peek / width).toBeGreaterThanOrEqual(0.25);
      expect(peek / width).toBeLessThanOrEqual(0.35);
    }
  });

  it("is measured from the screen: 390 wide cuts 152", () => {
    expect(featuredCardWidth(390)).toBe(152);
    expect(featuredCardWidth(360)).toBe(139);
    expect(featuredCardWidth(430)).toBe(169);
  });

  it("keeps a card readable on a narrow phone and sane on a tablet", () => {
    expect(featuredCardWidth(280)).toBeGreaterThanOrEqual(112);
    expect(featuredCardWidth(1024)).toBeLessThanOrEqual(220);
  });

  it("cuts the photo 3:4 portrait and snaps one card and its gap at a time", () => {
    expect(featuredImageHeight(150)).toBe(200);
    expect(featuredImageHeight(152)).toBe(203);
    expect(featuredSnapInterval(152)).toBe(152 + FEATURED_GAP);
  });
});

describe("keeping the held featured list", () => {
  const BEFORE_EXPIRY = Date.parse("2026-10-15T00:00:00.000Z");
  const read = (link: string, extra: Record<string, unknown> = {}) =>
    featuredPrintsFrom({
      items: [
        card("sci_a", extra),
        card("sci_b", { photos: [{ fileId: "file_b", sortOrder: 0, url: "/m/file_b", downloadUrl: link, downloadUrlExpiresAt: "2026-10-15T00:05:00.000Z" }] }),
      ],
    });

  it("reads re-signed links to the same photos as the same cards", () => {
    expect(sameFeaturedPrints(read("https://s/one"), read("https://s/two"))).toBe(true);
  });

  it("keeps the list already on screen for the same cards", () => {
    const held = read("https://s/one");
    expect(keepHeldFeatured(held, read("https://s/two"), BEFORE_EXPIRY)).toBe(held);
  });

  it("takes the new read when anything a client sees changed", () => {
    const held = read("https://s/one");
    for (const change of [{ name: "Posters" }, { clientFromPriceMinor: 1200 }, { pricingUnit: "per_page" }]) {
      const next = read("https://s/one", change);
      expect(keepHeldFeatured(held, next, BEFORE_EXPIRY)).toBe(next);
    }
  });

  it("takes the new read when a card or a photo file changed", () => {
    const held = read("https://s/one");
    const reordered = [...held].reverse();
    expect(keepHeldFeatured(held, reordered, BEFORE_EXPIRY)).toBe(reordered);
    const newPhoto = featuredPrintsFrom({ items: [card("sci_a"), card("sci_b", { photos: [{ fileId: "file_c", url: "/m/file_c" }] })] });
    expect(keepHeldFeatured(held, newPhoto, BEFORE_EXPIRY)).toBe(newPhoto);
    const shorter = held.slice(0, 1);
    expect(keepHeldFeatured(held, shorter, BEFORE_EXPIRY)).toBe(shorter);
  });

  it("takes the fresh links once a held one is stale", () => {
    const held = read("https://s/one");
    const next = read("https://s/two");
    expect(keepHeldFeatured(held, next, Date.parse("2026-10-15T00:04:45.000Z"))).toBe(next);
  });

  it("takes the first read whole", () => {
    const next = read("https://s/one");
    expect(keepHeldFeatured(null, next, BEFORE_EXPIRY)).toBe(next);
  });
});
