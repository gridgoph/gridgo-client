import type { MatchListing, MatchResult, OtherListing } from "@/lib/api";

/**
 * A match as gridgo-api#126 answers it, for the match-screen tests.
 *
 * The shop names, address and phone below are deliberately real-looking: the
 * Top Pick's compatibility `shop` block still carries them, and the tests
 * assert that not one of them reaches the screen.
 */
export const SHOP_IDENTITY = [
  "Lovis Printshop",
  "Bajada",
  "0917 555 0101",
  "Rapid Print",
  "PrintZone Davao",
  "Matina Crossing",
  "user_lovis",
  "user_rapid",
] as const;

/** An ISO instant this far from now — "Ready in" lines count from the real clock. */
export function fromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function topListing(id = "sci_lovis_tarp", overrides: Partial<MatchListing> = {}): MatchListing {
  return {
    id,
    supplierId: "user_lovis",
    supplierServiceId: "svc_lovis",
    categoryCode: "marketing_collateral",
    subcategoryCode: "tarpaulins_outdoor_banners",
    name: "Tarpaulin Print",
    description: null,
    basePriceMinor: 2000,
    fromPriceMinor: 2000,
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
    // Twelve hours out, less a minute: "Ready in 12 hours".
    readyBy: fromNow(12 * 60 - 1),
    placeInLine: 4,
    selectToken: `tok_${id}`,
    distanceZone: { key: "nearby", label: "Nearby" },
    ...overrides,
  };
}

export function otherListing(id: string, overrides: Partial<OtherListing> = {}): OtherListing {
  return {
    id,
    name: "UV Printing",
    photos: [],
    fromPriceMinor: 1000,
    clientFromPriceMinor: 1100,
    pricingUnit: "per_area",
    packageQty: null,
    distanceZone: { key: "long_distance", label: "Long Distance" },
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
    turnaroundHours: 1,
    rush: null,
    acceptedFormats: [],
    optionGroups: [],
    version: 1,
    readyBy: fromNow(50),
    placeInLine: 1,
    selectToken: `tok_${id}`,
    ...overrides,
  };
}

export function topPickMatch(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    ranking: ["quality", "speed", "cost", "distance"],
    matchReason: { key: "quality", label: "Matched for Quality" },
    matchRequestId: "req_match_1",
    selectTokenExpiresAt: "2099-01-01T00:00:00.000Z",
    distanceZone: { key: "nearby", label: "Nearby" },
    rating: { average: 4.3, count: 12 },
    // Compatibility only: the screen must never draw any of this.
    shop: {
      supplierId: "user_lovis",
      shopName: "Lovis Printshop",
      shop: { lat: 7.0731, lng: 125.6128, label: "Lovis Printshop · Bajada, Davao City · 0917 555 0101" },
      media: [],
      categories: ["marketing_collateral"],
      services: [],
    } as unknown as MatchResult["shop"],
    queue: { jobsAhead: 3, estimatedHours: 12 },
    promiseBy: null,
    reasons: [
      { code: "ranked_quality", factor: "quality", rank: 1, weight: 1, detail: "88% listing completeness" },
    ],
    listings: [topListing()],
    otherListings: [
      // An API that leaked a shop field would still not get it drawn.
      {
        ...otherListing("sci_rapid_uv", { name: "UV Printing", placeInLine: 1 }),
        shopName: "Rapid Print",
        address: "Matina Crossing",
      } as OtherListing,
      otherListing("sci_zone_tarp", {
        name: "Tarpaulin Banner",
        fromPriceMinor: 1200,
        basePriceMinor: 1200,
        placeInLine: 2,
        distanceZone: { key: "nearby", label: "Nearby" },
        rating: { average: 4.6, count: 8 },
      }),
    ],
    alternativesCount: 2,
    score: {
      total: 100,
      weights: { quality: 1, speed: 0, cost: 0, distance: 0 },
      factors: { quality: 100, speed: 0, cost: 0, distance: 0 },
    },
    ...overrides,
  };
}

export const ZONE_BANDS = [
  { zone: "nearby", label: "Nearby", maxDistanceMeters: 5000, feeMinor: 2500 },
  { zone: "away", label: "Away", maxDistanceMeters: 10000, feeMinor: 5000 },
  { zone: "long_distance", label: "Long Distance", maxDistanceMeters: 15000, feeMinor: 7500 },
  { zone: "out_of_zone", label: "Out of Zone", maxDistanceMeters: null, baseFeeMinor: 7500, perKmMinor: 1000 },
];

/** A Long Distance Top Pick, with one near and one Out of Zone listing beside it. */
export function zonedMatch(): MatchResult {
  return topPickMatch({
    distanceZone: { key: "long_distance", label: "Long Distance" },
    rating: { average: 4.6, count: 12 },
    listings: [topListing("pick", { distanceZone: { key: "long_distance", label: "Long Distance" } })],
    otherListings: [
      otherListing("near", {
        name: "Flyers near",
        distanceZone: { key: "nearby", label: "Nearby" },
        rating: { average: 4.8, count: 31 },
      }),
      otherListing("far", {
        name: "Flyers far",
        distanceZone: { key: "out_of_zone", label: "Out of Zone" },
        distanceKm: 16,
      }),
    ],
  });
}
