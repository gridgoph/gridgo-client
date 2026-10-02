import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import MatchScreen from "@/app/request/match";
import { ZONE_BANDS, topPickMatch, zonedMatch } from "@/test/matchFixtures";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import { clearMatchPrefetch } from "@/lib/matchPrefetch";
import { matchSelectionFor } from "@/lib/matchSelection";
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

describe("MatchScreen distance zones, warning answered", () => {
  it("lets the client choose the Out of Zone listing anyway, keeping its pick token", async () => {
    api.matchShop.mockResolvedValue(zonedMatch());
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    fireEvent.press(screen.getByLabelText(/^Flyers far/));
    const choose = await screen.findByLabelText("Choose this listing");
    fireEvent.press(choose);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/request/listing",
      params: { itemId: "far" },
    });
    expect(matchSelectionFor("far")?.selectToken).toBe("tok_far");
  });
});
