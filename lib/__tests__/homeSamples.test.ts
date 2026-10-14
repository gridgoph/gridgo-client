import { pagePadding } from "@/constants/theme";
import {
  SAMPLE_GAP,
  SAMPLE_PEEK,
  featuredPrintsFrom,
  homeSampleCardWidth,
  homeSamplePhotoHeight,
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
