import type { MatchListing, OtherListing } from "@/lib/api";
import {
  hasFullSheet,
  matchBadge,
  matchedRanking,
  ordinal,
  otherListingsOf,
  placeLabel,
  placeOrdinal,
  readyInLine,
  sheetListing,
  topPickListing,
} from "@/lib/match";

function topListing(id: string, overrides: Partial<MatchListing> = {}): MatchListing {
  return {
    id,
    supplierId: "user_lovis",
    supplierServiceId: "svc_lovis",
    categoryCode: "marketing_collateral",
    subcategoryCode: "tarpaulins_outdoor_banners",
    name: "Tarpaulin Print",
    description: "Lovis Printshop, open daily",
    basePriceMinor: 1200,
    fromPriceMinor: 1200,
    effectivePriceMinor: null,
    pricingUnit: "per_area",
    packageQty: null,
    measurementKind: "area",
    measureUnit: "ft",
    minimumWidthMilli: null,
    minimumHeightMilli: null,
    minimumLengthMilli: null,
    minimumOrderQuantity: null,
    priceTiers: [],
    speedTiers: [],
    pricingBasis: "per_area",
    turnaroundMode: "override",
    turnaroundHours: 12,
    rush: null,
    acceptedFormats: [],
    photos: [],
    prepSteps: [],
    optionGroups: [],
    version: 1,
    serviceVersion: 1,
    readyBy: "2026-10-12T02:58:00.000Z",
    placeInLine: 4,
    selectToken: `tok_${id}`,
    ...overrides,
  };
}

function otherListing(id: string, overrides: Partial<OtherListing> = {}): OtherListing {
  return {
    id,
    name: "Tarpaulin Print",
    photos: [],
    fromPriceMinor: 1000,
    clientFromPriceMinor: 1100,
    pricingUnit: "per_area",
    packageQty: null,
    distanceZone: { key: "nearby", label: "Nearby" },
    categoryCode: "marketing_collateral",
    subcategoryCode: "tarpaulins_outdoor_banners",
    basePriceMinor: 1000,
    effectivePriceMinor: null,
    measurementKind: "area",
    measureUnit: "ft",
    minimumWidthMilli: null,
    minimumHeightMilli: null,
    minimumLengthMilli: null,
    minimumOrderQuantity: null,
    priceTiers: [],
    speedTiers: [],
    pricingBasis: "per_area",
    turnaroundHours: 12,
    rush: null,
    acceptedFormats: [],
    optionGroups: [],
    version: 1,
    readyBy: "2026-10-12T02:58:00.000Z",
    placeInLine: 1,
    selectToken: `tok_${id}`,
    ...overrides,
  };
}

describe("matchBadge", () => {
  it("sets the API's own reason as the overline", () => {
    expect(matchBadge({ matchReason: { key: "quality", label: "Matched for Quality" } })).toBe(
      "MATCHED FOR QUALITY",
    );
    expect(matchBadge({ matchReason: { key: "cost", label: "Matched for Best Value" } })).toBe(
      "MATCHED FOR BEST VALUE",
    );
    expect(
      matchBadge({ matchReason: { key: "vetted", label: "GRIDGO-Vetted Supplier" } }),
    ).toBe("GRIDGO-VETTED SUPPLIER");
  });

  it("says nothing on an API from before the badge, rather than guessing one", () => {
    expect(matchBadge({})).toBeNull();
    expect(matchBadge({ matchReason: { key: "quality", label: "  " } })).toBeNull();
  });
});

describe("topPickListing and otherListingsOf", () => {
  const match = {
    listings: [topListing("pick"), topListing("pick_second")],
    otherListings: [otherListing("other_a"), otherListing("other_b")],
  };

  it("takes the Top Pick's recommended listing", () => {
    expect(topPickListing(match)?.id).toBe("pick");
    expect(topPickListing({ listings: [] })).toBeNull();
  });

  it("lists every other shop's listing in the API's order, then the pick's other listings", () => {
    expect(otherListingsOf(match).map((listing) => listing.id)).toEqual([
      "other_a",
      "other_b",
      "pick_second",
    ]);
  });

  it("copes with an API that sends no other listings", () => {
    expect(otherListingsOf({ listings: [topListing("pick")] })).toEqual([]);
  });
});

describe("matchedRanking", () => {
  it("reads the ranking GRIDGO echoed back", () => {
    expect(matchedRanking({ ranking: ["cost", "speed", "quality", "distance"] }, null)).toEqual([
      "cost",
      "speed",
      "quality",
      "distance",
    ]);
  });

  it("falls back to what the screen asked with", () => {
    const asked = ["speed", "quality", "cost", "distance"] as const;
    expect(matchedRanking({}, asked)).toBe(asked);
    expect(matchedRanking(null, asked)).toBe(asked);
  });
});

describe("placeOrdinal", () => {
  it("says the place in line the way a queue is said", () => {
    expect(placeOrdinal(1)).toBe("1st");
    expect(placeOrdinal(4)).toBe("4th");
    expect(placeLabel(4)).toBe("4th in line");
  });

  it("draws nothing for a place GRIDGO did not send", () => {
    expect(placeOrdinal(null)).toBeNull();
    expect(placeOrdinal(undefined)).toBeNull();
    expect(placeOrdinal(0)).toBeNull();
    expect(placeOrdinal(Number.NaN)).toBeNull();
  });
});

describe("readyInLine", () => {
  const now = Date.parse("2026-10-11T14:58:00.000Z");

  // Now is 10:58 PM on Sunday 11 Oct in Davao.
  it("counts Davao calendar days to the client promise, never hours", () => {
    expect(readyInLine("2026-10-11T15:30:00.000Z", now)).toBe("Ready today");
    // Twelve hours away, but tomorrow on the calendar the READY BY date shows.
    expect(readyInLine("2026-10-12T02:58:00.000Z", now)).toBe("Ready tomorrow");
    expect(readyInLine("2026-10-14T14:58:00.000Z", now)).toBe("Ready in 3 days");
    // 49 hours away, yet three calendar days: the date wins over rounding.
    expect(readyInLine("2026-10-13T15:58:00.000Z", now)).toBe("Ready in 2 days");
    expect(readyInLine("2026-10-13T16:30:00.000Z", now)).toBe("Ready in 3 days");
  });

  it("says nothing without a promise, or with one already past", () => {
    expect(readyInLine(null, now)).toBeNull();
    expect(readyInLine("not a date", now)).toBeNull();
    expect(readyInLine("2026-10-10T00:00:00.000Z", now)).toBeNull();
  });
});

describe("ordinal", () => {
  it("handles the teens, which is where every naive version breaks", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(111)).toBe("111th");
  });
});

describe("sheetListing", () => {
  it("passes the Top Pick's full listing through", () => {
    const pick = topListing("pick");
    expect(hasFullSheet(pick)).toBe(true);
    expect(sheetListing(pick)).toBe(pick);
  });

  it("fills another shop's listing empty rather than guessing whose it is", () => {
    const other = otherListing("other_a");
    expect(hasFullSheet(other)).toBe(false);
    const sheet = sheetListing(other);
    expect(sheet.supplierId).toBe("");
    expect(sheet.description).toBeNull();
    expect(sheet.prepSteps).toEqual([]);
    expect(sheet.name).toBe("Tarpaulin Print");
    expect(sheet.optionGroups).toBe(other.optionGroups);
  });
});
