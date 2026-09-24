import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import MatchScreen from "@/app/request/match";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import type { MatchReason, MatchResult } from "@/lib/api";
import { clearMatchPrefetch } from "@/lib/matchPrefetch";
import { useCart } from "@/store/cart";
import { usePriorities } from "@/store/priorities";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockCanGoBack(),
  }),
  useLocalSearchParams: () => ({ subcategory: "tarpaulins_outdoor_banners", category: "marketing_collateral" }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  const { PRODUCT_CATEGORY_SEED: seed } = jest.requireActual("@/data/productCategories");
  return {
    ...actual,
    productCategoriesNow: jest.fn(() => seed),
    getProductCategories: jest.fn(),
    matchShop: jest.fn(),
    matchNextShop: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { usePlatformSettings } = require("@/store/platformSettings");

const RANKED: MatchReason[] = [
  { code: "ranked_speed", factor: "speed", rank: 1, weight: 0.5, detail: "0 jobs ahead; about 48 hours" },
  { code: "ranked_quality", factor: "quality", rank: 2, weight: 0.3, detail: "88% listing completeness" },
  { code: "ranked_distance", factor: "distance", rank: 3, weight: 0.2, detail: "1240 metres from the delivery pin" },
];

function flyers(supplierId: string) {
  return {
    id: `${supplierId}_flyers`,
    supplierId,
    supplierServiceId: `svc_${supplierId}`,
    categoryCode: "marketing_collateral",
    subcategoryCode: "flyers",
    name: "Flyers",
    description: null,
    basePriceMinor: 2500,
    fromPriceMinor: 2500,
    effectivePriceMinor: null,
    pricingUnit: "per_package" as const,
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
    turnaroundMode: "override" as const,
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

function match(
  supplierId: string,
  shopName: string,
  overrides: Partial<MatchResult> = {},
): MatchResult {
  return {
    shop: {
      supplierId,
      shopName,
      shop: { lat: 7.0731, lng: 125.6128, label: `${shopName} · Bajada, Davao City` },
      media: [],
      categories: ["marketing_collateral"],
      services: [],
    },
    queue: { jobsAhead: 0, estimatedHours: 48 },
    reasons: RANKED,
    listings: [flyers(supplierId)],
    alternativesCount: 0,
    score: {
      total: 82,
      weights: { quality: 0.3, speed: 0.4, cost: 0.2, distance: 0.1 },
      factors: { quality: 88, speed: 100, cost: 100, distance: 0 },
    },
    ...overrides,
  };
}

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  mockReplace.mockClear();
  mockCanGoBack.mockReturnValue(true);
  api.productCategoriesNow.mockReturnValue(PRODUCT_CATEGORY_SEED);
  api.getProductCategories.mockResolvedValue(PRODUCT_CATEGORY_SEED);
  api.matchShop.mockResolvedValue(match("user_lovis", "Lovis Printshop"));
  api.matchNextShop.mockReset();
  clearMatchPrefetch();
  useCart.getState().reset();
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
  usePriorities.setState({ ranking: ["speed", "quality", "cost", "distance"], loaded: true });
});

/*
  Tarpaulin listings carry the widest thing their press prints. The client
  reads it on the match before choosing a listing (gridgoph/gridgo-client#73).
*/
function tarp(id: string, name: string, printerMaxWidthFeet: number | null) {
  return {
    ...flyers("user_lovis"),
    id,
    name,
    subcategoryCode: "tarpaulins_outdoor_banners",
    pricingUnit: "per_area" as const,
    packageQty: null,
    measurementKind: "area" as const,
    measureUnit: "ft" as const,
    printerMaxWidthFeet,
  };
}

describe("a tarpaulin match", () => {
  it("shows width limits alongside press time and the projected ready date", async () => {
    api.matchShop.mockResolvedValue(
      match("user_lovis", "Lovis Printshop", {
        listings: [
          { ...tarp("sci_narrow", "Standard tarpaulin", 7), turnaroundHours: 3 },
          tarp("sci_wide", "Wide tarpaulin", 10),
          tarp("sci_open", "Mesh banner", null),
        ],
        queue: { jobsAhead: 2, estimatedHours: 48 },
        promiseBy: "2026-09-26T06:00:00.000Z",
      }),
    );
    await renderInSafeArea(<MatchScreen />);

    expect(await screen.findByText("PRINT WIDTH")).toBeTruthy();
    expect(screen.getByText("Up to 10 ft wide")).toBeTruthy();
    expect(screen.getByText("Prints in about 3 hours")).toBeTruthy();
    expect(screen.getByText("READY BY")).toBeTruthy();
    expect(screen.getByText("Sat, Sep 26, 2026 · 2:00 PM")).toBeTruthy();
    expect(screen.getByText("Includes jobs ahead and shop opening hours.")).toBeTruthy();
    expect(screen.queryByText("Ready in 3 hours")).toBeNull();
    expect(screen.getByText("Prints up to 7 ft wide")).toBeTruthy();
    expect(screen.getByText("Prints up to 10 ft wide")).toBeTruthy();
    // A listing with no published cap says nothing rather than a guess.
    expect(screen.getAllByText(/Prints up to/)).toHaveLength(2);
    expect(screen.getByLabelText(/Standard tarpaulin, .*prints up to 7 ft wide/)).toBeTruthy();
  });

  it("leaves the width off when no listing publishes one", async () => {
    api.matchShop.mockResolvedValue(
      match("user_lovis", "Lovis Printshop", {
        listings: [tarp("sci_open", "Mesh banner", null)],
      }),
    );
    await renderInSafeArea(<MatchScreen />);

    expect(await screen.findByText("Mesh banner")).toBeTruthy();
    expect(screen.queryByText("PRINT WIDTH")).toBeNull();
    expect(screen.queryByText(/Prints up to/)).toBeNull();
  });
});
