import { fireEvent, render, screen } from "@testing-library/react-native";
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

/**
 * "Order a sample first" sits under a match card whose shop offers a sample,
 * at GRIDGO's sample price, and opens the listing with the sample leading
 * (gridgo-api#222). A shop that offers none shows no button.
 */
describe("MatchScreen sample offer", () => {
  it("offers a sample under the cards that have one and opens the sheet for it", async () => {
    api.matchShop.mockResolvedValue(
      topPickMatch({
        listings: [topListing("sci_lovis_tarp", { sampleAvailable: true, samplePriceMinor: 5000, clientSamplePriceMinor: 5500 })],
        otherListings: [otherListing("sci_plain", { name: "Plain Flyers", sampleAvailable: false })],
      }),
    );
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    const offers = screen.getAllByRole("button", { name: /^Order a sample first/ });
    expect(offers).toHaveLength(1);
    expect(screen.getByText("Order a sample first · ₱55.00")).toBeTruthy();

    fireEvent.press(offers[0]);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/request/listing",
      params: { itemId: "sci_lovis_tarp", sample: "1" },
    });
  });
});
