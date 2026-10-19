import { render, screen } from "@testing-library/react-native";

import { TopPickCard } from "@/components/TopPickCard";
import type { MatchListing, MatchResult, Scheduling, ShopHours } from "@/lib/api";
import { usePlatformSettings } from "@/store/platformSettings";

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

/** A Davao instant today at the given hour, so "Today" holds whenever this runs. */
function davaoToday(hour: number, plusDays = 0): string {
  const davao = new Date(Date.now() + 8 * 3_600_000);
  const day = davao.toISOString().slice(0, 10);
  return new Date(Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00+08:00`) + plusDays * 86_400_000).toISOString();
}

const RUSH_TIER = {
  id: "tier_rush",
  label: "Same day",
  turnaroundHours: 4,
  priceMinor: 1_500,
  surchargeMinor: null,
  clientPriceMinor: 1_545,
  clientSurchargeMinor: null,
};

function scheduled(scheduling: Scheduling | undefined, readyBy: string): MatchListing {
  return { ...listing(), readyBy, ...(scheduling ? { scheduling } : {}) };
}

beforeEach(() => {
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({ issueWindowHours: 24, serviceFeeRateBps: 1000, deliveryFeeBands: [] });
});

describe("Tight, Secured and Rush on the Top Pick (gridgo-api#292)", () => {
  it("says a same-day Tight pick's clock time and that the shop may decline", async () => {
    const readyBy = davaoToday(15);
    const pick = scheduled({ status: "tight", readyBy, tightDeadline: true, label: "Tight deadline" }, readyBy);
    await render(<TopPickCard match={match(pick)} listing={pick} onPress={() => undefined} />);
    expect(screen.getByText("Today, ready by 3:00 PM")).toBeTruthy();
    expect(screen.getByText("Tight: the shop may decline")).toBeTruthy();
    expect(screen.queryByText("Rush, costs more")).toBeNull();
  });

  it("says tomorrow's time on a Secured pick and wears no chip", async () => {
    const readyBy = davaoToday(11, 1);
    const pick = scheduled({ status: "secured", readyBy }, readyBy);
    await render(<TopPickCard match={match(pick)} listing={pick} onPress={() => undefined} />);
    expect(screen.getByText("Tomorrow, ready by 11:00 AM")).toBeTruthy();
    expect(screen.queryByText(/Tight|Rush/)).toBeNull();
  });

  it("shows a Rush pick's price only as GRIDGO sent it", async () => {
    const readyBy = davaoToday(13, 3);
    const pick = scheduled({ status: "rush", readyBy, rushTier: RUSH_TIER }, readyBy);
    await render(<TopPickCard match={match(pick)} listing={pick} onPress={() => undefined} />);
    expect(screen.getByText("Rush, costs more")).toBeTruthy();
    expect(screen.getByText("Rush rate ₱15.45 each")).toBeTruthy();
  });

  it("draws Rush without a price when GRIDGO sent none", async () => {
    const readyBy = davaoToday(13, 3);
    const tier = { ...RUSH_TIER, clientPriceMinor: null };
    const pick = scheduled({ status: "rush", readyBy, rushTier: tier }, readyBy);
    await render(<TopPickCard match={match(pick)} listing={pick} onPress={() => undefined} />);
    expect(screen.getByText("Rush, costs more")).toBeTruthy();
    expect(screen.queryByText(/Rush rate|Rush adds/)).toBeNull();
  });

  it("reads an older match without `scheduling` exactly as before", async () => {
    const readyBy = davaoToday(15, 4);
    const pick = scheduled(undefined, readyBy);
    await render(<TopPickCard match={match(pick)} listing={pick} onPress={() => undefined} />);
    expect(screen.getByText("Ready in 4 days")).toBeTruthy();
    expect(screen.queryByText(/Tight|Rush|ready by/)).toBeNull();
  });
});
