import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import MatchScreen from "@/app/request/match";
import { ZONE_BANDS, otherListing, topListing, topPickMatch, zonedMatch } from "@/test/matchFixtures";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import { clearMatchPrefetch } from "@/lib/matchPrefetch";
import { useCart } from "@/store/cart";
import { useOrderRanking } from "@/store/orderRanking";
import { usePriorities } from "@/store/priorities";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({
    subcategory: "tarpaulins_outdoor_banners",
    category: "marketing_collateral",
  }),
  Redirect: () => null,
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  const { PRODUCT_CATEGORY_SEED: seed } = jest.requireActual("@/data/productCategories");
  return {
    ...actual,
    productCategoriesNow: jest.fn(() => seed),
    getProductCategories: jest.fn(),
    matchShop: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { usePlatformSettings } = require("@/store/platformSettings");

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
  api.productCategoriesNow.mockReturnValue(PRODUCT_CATEGORY_SEED);
  api.getProductCategories.mockResolvedValue(PRODUCT_CATEGORY_SEED);
  api.matchShop.mockReset();
  api.matchShop.mockResolvedValue(topPickMatch());
  clearMatchPrefetch();
  useCart.getState().reset();
  useOrderRanking.getState().clear();
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: ZONE_BANDS,
  });
  usePriorities.setState({ ranking: ["quality", "speed", "cost", "distance"], loaded: true });
});

describe("MatchScreen distance zones", () => {
  it("shows the zone word and rating on the Top Pick and every other listing", async () => {
    api.matchShop.mockResolvedValue(zonedMatch());
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    // Top Pick: the word and the star, never a figure.
    expect(screen.getByText("Long Distance")).toBeTruthy();
    expect(screen.getByText("4.6 (12)")).toBeTruthy();

    // A near listing: the word alone, with its own rating.
    expect(screen.getByText("Nearby")).toBeTruthy();
    expect(screen.getByText("4.8 (31)")).toBeTruthy();

    // Out of Zone is the one place a kilometre figure appears.
    expect(screen.getByText("Out of Zone · 16.0 km")).toBeTruthy();
    expect(screen.getAllByText(/\bkm\b/)).toHaveLength(1);
    expect(screen.getByLabelText(/^Flyers far.*Out of Zone · 16\.0 km/)).toBeTruthy();
  });

  it("draws no rating where the API sent none", async () => {
    api.matchShop.mockResolvedValue(
      topPickMatch({
        distanceZone: { key: "away", label: "Away" },
        rating: undefined,
        listings: [topListing("pick", { distanceZone: { key: "away", label: "Away" } })],
        otherListings: [otherListing("other", { distanceZone: { key: "away", label: "Away" } })],
      }),
    );
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    expect(screen.getAllByText("Away")).toHaveLength(2);
    expect(screen.queryByText(/\(\d+\)/)).toBeNull();
    expect(screen.queryByLabelText(/Rated/)).toBeNull();
  });

  it("says distance decided it with a word, never a measurement", async () => {
    api.matchShop.mockResolvedValue(
      topPickMatch({
        ranking: ["distance", "quality", "speed", "cost"],
        matchReason: { key: "distance", label: "Matched for Distance" },
        distanceZone: { key: "nearby", label: "Nearby" },
        otherListings: [],
      }),
    );
    useCart.setState({
      cart: {
        id: "cart_1",
        state: "draft",
        version: 1,
        serviceLevel: "standard",
        scheduledFor: null,
        fulfillmentMode: "delivery",
        defaultDropoff: { lat: 7.076, lng: 125.615, label: "Home" },
        lines: [],
        checkedOutOrderId: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    });
    await renderInSafeArea(<MatchScreen />);

    expect(await screen.findByText("MATCHED FOR DISTANCE")).toBeTruthy();
    expect(screen.getByText("Nearby")).toBeTruthy();
    expect(screen.queryByText(/\d(\.\d)? ?(km|m)\b/)).toBeNull();
  });

  // One press per file, last: see AGENTS.md "Running and testing".
  it("warns before an Out of Zone listing opens, and does not open it yet", async () => {
    api.matchShop.mockResolvedValue(zonedMatch());
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    fireEvent.press(screen.getByLabelText(/^Flyers far/));

    expect(await screen.findByText("This shop is outside GRIDGO's delivery zones")).toBeTruthy();
    expect(screen.getByText(/16\.0 km from your drop-off/)).toBeTruthy();
    expect(screen.getByText(/base fee plus a fee for every kilometre \(₱75\.00 \+ ₱10\.00 per km\)/)).toBeTruthy();
    expect(screen.getByText(/can cost a lot more than usual/)).toBeTruthy();
    expect(screen.getByLabelText("Choose this listing")).toBeTruthy();
    expect(screen.getByText("Pick another listing")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
