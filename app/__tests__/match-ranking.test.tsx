import { act, render, screen, waitFor } from "@testing-library/react-native";
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
  // The first-order tour registers its screen on focus (`useTourScreen`).
  useFocusEffect: () => undefined,
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockCanGoBack(),
  }),
  useLocalSearchParams: () => ({ subcategory: "flyers", category: "marketing_collateral" }),
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
    savePreferences: jest.fn(async (ranking: string[]) => ({ ranking, version: 2, updatedAt: null })),
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
  gridgo-client#127: "Change" on this screen saves a new order and comes back
  here. GRIDGO matches on the saved order, so the shop on screen has to be
  asked for again — keeping the old one would show the new chips over the old
  order's pick. Its own file: it writes to a store after render (see AGENTS.md).
*/
describe("MatchScreen after the ranking changes", () => {
  it("matches again on the new order, and not on a same-order re-read", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("GRIDGO’s pick for flyers");
    expect(api.matchShop).toHaveBeenCalledTimes(1);

    // A re-read that keeps the same order is not a new question.
    await act(async () => {
      usePriorities.setState({ ranking: ["speed", "quality", "cost", "distance"] });
    });
    expect(api.matchShop).toHaveBeenCalledTimes(1);

    // What "Change" does: the ranking screen saves, then comes back here.
    api.matchShop.mockResolvedValue(match("user_rapid", "Rapid Print"));
    await act(async () => {
      await usePriorities.getState().save(["cost", "speed", "quality", "distance"]);
    });

    await waitFor(() => expect(api.matchShop).toHaveBeenCalledTimes(2));
  });
});
