import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import type { Cart } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useSession } from "@/store/session";

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
    listCatalog: jest.fn(async () => []),
    getProductCategories: jest.fn(async () => []),
    getCart: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

function cart(lineCount: number): Cart {
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: null,
    lines: Array.from({ length: lineCount }, (_, index) => ({
      id: `cline_${index}`,
      supplierId: "user_lovis",
      catalogItemId: "sci_flyers",
      quantity: 1,
      optionIds: [],
      measurement: null,
      structuredSpec: {},
      artworkFileId: null,
      mockupFileId: null,
      dropoff: null,
      sortOrder: index,
      listing: null,
      lineSubtotalMinor: 2200,
    })),
    checkedOutOrderId: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
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
  api.getCart.mockReset();
  api.getCart.mockResolvedValue(cart(2));
  useCart.getState().reset();
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
 * Home is where a client lands after leaving checkout to add one more thing,
 * and nothing on it said the basket was still there.
 */
describe("the cart control on Home", () => {
  it("sits beside the mark and counts what is in the basket", async () => {
    useCart.setState({ cartId: "cart_1", cart: cart(2) });
    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByLabelText("Your order, 2 items")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("re-reads the basket on the way in, because it lives on GRIDGO", async () => {
    useCart.setState({ cartId: "cart_1", cart: null });
    await renderInSafeArea(<HomeScreen />);

    await waitFor(() => expect(api.getCart).toHaveBeenCalledWith("cart_1"));
    expect(await screen.findByLabelText("Your order, 2 items")).toBeTruthy();
  });

  it("opens checkout, and opens it empty too", async () => {
    // Checkout's empty state is a real answer, so the control does not vanish
    // when there is nothing in the basket.
    await renderInSafeArea(<HomeScreen />);

    fireEvent.press(await screen.findByLabelText("Your order, empty"));
    expect(mockPush).toHaveBeenCalledWith("/checkout");
  });
});
