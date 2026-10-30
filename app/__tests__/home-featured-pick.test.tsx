import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import { useCart } from "@/store/cart";
import { useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";
import { usePlatformSettings } from "@/store/platformSettings";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: mockPush, replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listOrders: jest.fn(async () => []),
    getProductCategories: jest.fn(async () => []),
    getCart: jest.fn(async () => null),
    getFeaturedPrints: jest.fn(async () => ({ items: [] })),
    listCatalogShops: jest.fn(async () => ({ shops: [], complete: true })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

/**
 * `GET /featured-prints` as gridgo-api sends it. Even a card that arrived
 * carrying a shop must not draw one.
 */
const FEATURED = {
  title: "FEATURED PRINTS",
  items: [
    {
      id: "sci_flyers",
      name: "Flyers",
      categoryCode: "marketing_collateral",
      subcategoryCode: "flyers",
      clientFromPriceMinor: 49_500,
      pricingUnit: "per_unit",
      packageQty: null,
      measureUnit: null,
      minimumOrderQuantity: null,
      shopName: "A press the client never sees",
      photos: [
        {
          fileId: "file_1",
          sortOrder: 0,
          url: "/catalog/media/file_1",
          downloadUrl: "https://storage.example/file_1",
        },
      ],
    },
  ],
  emptyState: null,
};

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
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
  api.listOrders.mockReset();
  api.listOrders.mockResolvedValue([]);
  api.getFeaturedPrints.mockReset();
  api.getFeaturedPrints.mockResolvedValue(FEATURED);
  api.listCatalogShops.mockReset();
  useCart.getState().reset();
  useRequestDraft.getState().reset();
  useSession.setState({
    user: {
      id: "user_1",
      name: "Rina Cruz",
      email: "rina@example.com",
      role: "client",
      accountType: "business",
      orgName: "Cruz Signs",
    },
    token: "tok_test",
  } as never);
});

/**
 * A featured card is a way into an order, not a picture: a tap starts the job
 * for that product through the ordinary date → match flow.
 */
it("starts the featured product's job on a tap", async () => {
  await renderInSafeArea(<HomeScreen />);

  const card = await screen.findByRole("button", { name: /^Flyers, from ₱495\.00/ });
  fireEvent.press(card);

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/request/when",
    params: { subcategory: "flyers", category: "marketing_collateral" },
  });
});
