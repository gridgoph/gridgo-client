import { cleanup, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import MatchScreen from "@/app/request/match";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import { clearMatchPrefetch } from "@/lib/matchPrefetch";
import { useBasketGroupTarget } from "@/store/basketGroup";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";
import { useOrderRanking } from "@/store/orderRanking";
import { usePriorities } from "@/store/priorities";
import { ZONE_BANDS, topPickMatch } from "@/test/matchFixtures";
import { multiCart } from "@/test/multiShopFixtures";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ subcategory: "brochures", category: "marketing_collateral" }),
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

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  api.productCategoriesNow.mockReturnValue(PRODUCT_CATEGORY_SEED);
  api.getProductCategories.mockResolvedValue(PRODUCT_CATEGORY_SEED);
  api.matchShop.mockReset();
  clearMatchPrefetch();
  useOrderRanking.getState().clear();
  useJobDeadline.getState().set("2026-12-01T08:00:00.000Z");
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({ issueWindowHours: 24, serviceFeeRateBps: 1000, deliveryFeeBands: ZONE_BANDS });
  usePriorities.setState({ ranking: ["quality", "speed", "cost", "distance"], loaded: true });
  const cart = multiCart(2);
  useCart.setState({ cartId: cart.id, cart, hydrated: true, loading: false, busy: false, error: null });
});

describe("MatchScreen, adding to a basket", () => {
  it("matches with the basket and this product's own date (gridgo-client#189)", async () => {
    useBasketGroupTarget.getState().clear();
    api.matchShop.mockResolvedValue(topPickMatch());
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    expect(api.matchShop).toHaveBeenCalledWith(
      expect.objectContaining({ cartId: "cart_multi", deadline: "2026-12-01T08:00:00.000Z" }),
    );
    expect(api.matchShop.mock.calls[0][0]).not.toHaveProperty("groupId");
    expect(screen.queryByText(/^Adding to Shop/)).toBeNull();
  });

  it("holds the match to one shop group and says so", async () => {
    useBasketGroupTarget.getState().set("cline_0", "Shop A");
    api.matchShop.mockResolvedValue(topPickMatch());
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    expect(api.matchShop).toHaveBeenCalledWith(expect.objectContaining({ cartId: "cart_multi", groupId: "cline_0" }));
    expect(screen.getByText("Adding to Shop A")).toBeTruthy();
    expect(screen.getByLabelText("Look at every shop instead")).toBeTruthy();
  });

  it("offers every shop when the group's shop cannot print it", async () => {
    useBasketGroupTarget.getState().set("cline_1", "Shop B");
    api.matchShop.mockRejectedValue(
      new api.ApiError(404, { error: "match_not_found" }),
    );
    await renderInSafeArea(<MatchScreen />);

    expect(await screen.findByText("Shop B cannot print brochures")).toBeTruthy();
    expect(screen.getByText("Look at every shop")).toBeTruthy();
  });
});
