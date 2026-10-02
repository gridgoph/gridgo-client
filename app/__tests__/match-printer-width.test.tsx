import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import MatchScreen from "@/app/request/match";
import { ZONE_BANDS, otherListing, topListing, topPickMatch } from "@/test/matchFixtures";
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

/*
  Tarpaulin listings carry the widest thing their press prints. The client
  reads it on the match before choosing a listing (gridgoph/gridgo-client#73).
*/
describe("a tarpaulin match", () => {
  it("shows each listing's width limit beside its price and ready time", async () => {
    api.matchShop.mockResolvedValue(
      topPickMatch({
        listings: [topListing("sci_narrow", { name: "Standard tarpaulin", printerMaxWidthFeet: 7 })],
        otherListings: [
          otherListing("sci_wide", { name: "Wide tarpaulin", printerMaxWidthFeet: 10 }),
          otherListing("sci_open", { name: "Mesh banner", printerMaxWidthFeet: null }),
        ],
      }),
    );
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    expect(screen.getByText("Prints up to 7 ft wide")).toBeTruthy();
    expect(screen.getByText("Prints up to 10 ft wide")).toBeTruthy();
    // A listing with no published cap says nothing rather than a guess.
    expect(screen.getAllByText(/Prints up to/)).toHaveLength(2);
    expect(screen.getByLabelText(/^Wide tarpaulin, .*prints up to 10 ft wide/)).toBeTruthy();
    // The ready line is the client promise, never press time.
    expect(screen.queryByText(/Prints in about/)).toBeNull();
  });

  it("leaves the width off when no listing publishes one", async () => {
    api.matchShop.mockResolvedValue(
      topPickMatch({
        listings: [topListing("sci_open", { name: "Mesh banner", printerMaxWidthFeet: null })],
        otherListings: [],
      }),
    );
    await renderInSafeArea(<MatchScreen />);

    expect(await screen.findByText("Mesh banner")).toBeTruthy();
    expect(screen.queryByText(/Prints up to/)).toBeNull();
  });
});
