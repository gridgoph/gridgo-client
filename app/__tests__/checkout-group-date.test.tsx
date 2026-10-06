import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CheckoutScreen from "@/app/checkout";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { DATE_MID, datedCart, MULTI_SETTINGS } from "@/test/multiShopFixtures";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // Required inside the factory: jest.mock is hoisted above imports.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getSettings: jest.fn(),
    getCart: jest.fn(),
    getCatalogShop: jest.fn(),
    setCartDropoffs: jest.fn(),
    listAddresses: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

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

// One press per file: see "Running and testing" in AGENTS.md.
it("moves one group to another date through the date step", async () => {
  const cart = datedCart();
  api.getSettings.mockResolvedValue(MULTI_SETTINGS);
  api.getCart.mockResolvedValue(cart);
  api.listAddresses.mockResolvedValue([]);
  useCheckoutPayment.getState().reset();
  useCart.setState({ cartId: cart.id, cart, loading: false, busy: false, error: null, hydrated: true });

  await renderInSafeArea(<CheckoutScreen />);
  await fireEvent.press(await screen.findByLabelText("Shop B: Needed by Fri 16 Oct. Change the date."));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/request/when",
    params: { mode: "group", lineIds: "cline_1", label: "Shop B", current: DATE_MID, subcategory: "" },
  });
});
