import { render, screen } from "@testing-library/react-native";

import { OtherListingRow } from "@/components/OtherListingRow";
import { TopPickCard } from "@/components/TopPickCard";
import type { MatchListing, MatchResult, ShopHours } from "@/lib/api";
import { usePlatformSettings } from "@/store/platformSettings";

const CLOSED: ShopHours = {
  isOpenNow: false,
  temporarilyClosed: false,
  calendarAvailable: true,
  nextOpeningAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
};

function listing(shopHours?: ShopHours): MatchListing {
  return {
    id: "sci_1",
    supplierId: "user_shop",
    supplierServiceId: "svc",
    categoryCode: "marketing_collateral",
    subcategoryCode: "flyers",
    name: "Flyers",
    description: null,
    basePriceMinor: 40_000,
    fromPriceMinor: 40_000,
    clientFromPriceMinor: 44_000,
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
    turnaroundMode: "inherit",
    turnaroundHours: 24,
    rush: null,
    acceptedFormats: [],
    photos: [],
    prepSteps: [],
    optionGroups: [],
    version: 1,
    serviceVersion: 1,
    readyBy: "2026-10-20T09:00:00.000Z",
    placeInLine: 2,
    ...(shopHours ? { shopHours } : {}),
  };
}

function match(pick: MatchListing): MatchResult {
  return {
    shop: { label: "Shop A" },
    queue: { jobsAhead: 1, estimatedHours: 10 },
    reasons: [],
    listings: [pick],
    alternativesCount: 0,
    score: { total: 0, weights: {} as MatchResult["score"]["weights"], factors: {} as MatchResult["score"]["factors"] },
  };
}

beforeEach(() => {
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({ issueWindowHours: 24, serviceFeeRateBps: 1000, deliveryFeeBands: [] });
});

describe("shop hours on the match", () => {
  it("shows when the Top Pick's shop next opens, from the listing's own hours", async () => {
    const pick = listing(CLOSED);
    await render(<TopPickCard match={match(pick)} listing={pick} onPress={() => undefined} />);
    expect(screen.getByText(/^Closed · opens /)).toBeTruthy();
    expect(screen.getByLabelText(/Top pick, .*Shop closed, opens /)).toBeTruthy();
  });

  it("never reads the hours off the compatibility shop block", async () => {
    const pick = listing();
    const held = { ...match(pick), shop: { label: "Shop A", hours: CLOSED } } as unknown as MatchResult;
    await render(<TopPickCard match={held} listing={pick} onPress={() => undefined} />);
    expect(screen.queryByText(/^Closed/)).toBeNull();
  });

  it("draws another listing's hours only when GRIDGO sends them", async () => {
    await render(<OtherListingRow listing={listing({ ...CLOSED, isOpenNow: true })} onPress={() => undefined} />);
    expect(screen.getByText("Open now")).toBeTruthy();
  });

  it("draws nothing on another listing that travels without hours", async () => {
    await render(<OtherListingRow listing={listing()} onPress={() => undefined} />);
    expect(screen.queryByText(/Open now|Closed/)).toBeNull();
  });
});
