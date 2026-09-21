import { act, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import MatchScreen from "@/app/request/match";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import type { MatchReason, MatchResult } from "@/lib/api";
import { clearMatchPrefetch } from "@/lib/matchPrefetch";
import { useCart } from "@/store/cart";
import { usePriorities } from "@/store/priorities";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
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
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const RANKED: MatchReason[] = [
  { code: "ranked_speed", factor: "speed", rank: 1, weight: 0.5, detail: "0 jobs ahead; about 48 hours" },
  { code: "ranked_quality", factor: "quality", rank: 2, weight: 0.3, detail: "88% listing completeness" },
  { code: "ranked_distance", factor: "distance", rank: 3, weight: 0.2, detail: "1240 metres from the delivery pin" },
];

function flyers(): MatchResult["listings"][number] {
  return {
    id: "user_lovis_flyers",
    supplierId: "user_lovis",
    supplierServiceId: "svc_user_lovis",
    categoryCode: "marketing_collateral",
    subcategoryCode: "flyers",
    name: "Flyers",
    description: null,
    basePriceMinor: 2500,
    fromPriceMinor: 2500,
    effectivePriceMinor: null,
    pricingUnit: "per_package",
    packageQty: 100,
    measurementKind: "none",
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

function pick(): MatchResult {
  return {
    shop: {
      supplierId: "user_lovis",
      shopName: "Lovis Printshop",
      shop: { lat: 7.0731, lng: 125.6128, label: "Lovis Printshop · Bajada, Davao City" },
      media: [],
      categories: ["marketing_collateral"],
      services: [],
    },
    queue: { jobsAhead: 0, estimatedHours: 48 },
    reasons: RANKED,
    listings: [flyers()],
    alternativesCount: 0,
    score: {
      total: 82,
      weights: { quality: 0.3, speed: 0.4, cost: 0.2, distance: 0.1 },
      factors: { quality: 88, speed: 100, cost: 100, distance: 0 },
    },
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
  api.productCategoriesNow.mockReturnValue(PRODUCT_CATEGORY_SEED);
  api.getProductCategories.mockResolvedValue(PRODUCT_CATEGORY_SEED);
  api.matchShop.mockResolvedValue(pick());
  clearMatchPrefetch();
  useCart.getState().reset();
  usePriorities.setState({ ranking: ["speed", "quality", "cost", "distance"], loaded: true });
});

describe("MatchScreen after the listing warms a cart", () => {
  it("does not rematch when a basket id appears", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("GRIDGO’s pick for flyers");
    const calls = api.matchShop.mock.calls.length;

    await act(async () => {
      useCart.setState({ cartId: "cart_warmed" });
    });
    expect(api.matchShop).toHaveBeenCalledTimes(calls);
    expect(screen.getByText("GRIDGO’s pick for flyers")).toBeTruthy();
  });
});
