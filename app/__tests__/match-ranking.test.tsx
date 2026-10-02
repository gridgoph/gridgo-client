import { act, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import MatchScreen from "@/app/request/match";
import { topListing, topPickMatch } from "@/test/matchFixtures";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import { clearMatchPrefetch } from "@/lib/matchPrefetch";
import { useCart } from "@/store/cart";
import { useOrderRanking } from "@/store/orderRanking";
import { usePriorities } from "@/store/priorities";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({
    push: jest.fn(),
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
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
  usePriorities.setState({ ranking: ["quality", "speed", "cost", "distance"], loaded: true });
});

afterEach(() => {
  jest.useRealTimers();
});

/*
  gridgo-client#155 and #157: "Change" re-ranks this job and comes back here.
  GRIDGO is asked again with the job's own order, and "GRIDGO is finding a
  printer" holds for a fixed three seconds however fast it answers. Its own
  file: it writes to a store after render (see AGENTS.md).
*/
describe("MatchScreen after the job is re-ranked", () => {
  it("rematches on the new order, holding the wait for three seconds even when GRIDGO is instant", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("MATCHED FOR QUALITY");
    expect(api.matchShop).toHaveBeenCalledTimes(1);

    // A re-read that keeps the same order is not a new question.
    await act(async () => {
      usePriorities.setState({ ranking: ["quality", "speed", "cost", "distance"] });
    });
    expect(api.matchShop).toHaveBeenCalledTimes(1);

    // What "Change" does: the job's own order is set, then the client is back here.
    jest.useFakeTimers();
    api.matchShop.mockResolvedValue(
      topPickMatch({
        ranking: ["cost", "speed", "quality", "distance"],
        matchReason: { key: "cost", label: "Matched for Best Value" },
        listings: [topListing("sci_cheapest", { name: "Budget Tarpaulin" })],
      }),
    );
    await act(async () => {
      useOrderRanking.getState().set(["cost", "speed", "quality", "distance"]);
    });

    // Asked again, with this job's order — the usual one is left alone.
    expect(api.matchShop).toHaveBeenCalledTimes(2);
    expect(api.matchShop.mock.calls[1][0]).toMatchObject({
      ranking: ["cost", "speed", "quality", "distance"],
    });
    expect(usePriorities.getState().ranking).toEqual(["quality", "speed", "cost", "distance"]);

    // GRIDGO has answered, but the wait holds: a fixed minimum, not the request time.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2999);
    });
    expect(screen.getByText("GRIDGO is finding a printer.")).toBeTruthy();
    // The new order is already on the chips while GRIDGO looks.
    expect(screen.getByLabelText("1: Cost")).toBeTruthy();
    expect(screen.queryByText("MATCHED FOR BEST VALUE")).toBeNull();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByText("GRIDGO is finding a printer.")).toBeNull();
    expect(screen.getByText("MATCHED FOR BEST VALUE")).toBeTruthy();
    expect(screen.getByText("Budget Tarpaulin")).toBeTruthy();
  });
});
