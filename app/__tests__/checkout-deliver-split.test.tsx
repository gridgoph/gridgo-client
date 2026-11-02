import { cleanup, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CheckoutScreen from "@/app/checkout";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { MULTI_SETTINGS } from "@/test/multiShopFixtures";
import { combinedShopCart, splitShopCart } from "@/test/shopDeliveryFixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
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
    setCartDeliveries: jest.fn(),
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

function seed(cart: ReturnType<typeof combinedShopCart>) {
  api.getSettings.mockResolvedValue(MULTI_SETTINGS);
  api.getCart.mockResolvedValue(cart);
  api.listAddresses.mockResolvedValue([]);
  useCheckoutPayment.getState().reset();
  useCart.setState({ cartId: cart.id, cart, loading: false, busy: false, error: null, hydrated: true });
}

afterEach(async () => {
  await cleanup();
});

// gridgo-api#275: each delivery is its own fee, shown before paying.
it("shows each delivery of a split shop as its own fee line", async () => {
  seed(splitShopCart());

  await renderInSafeArea(<CheckoutScreen />);
  expect(await screen.findByText("Shop A, delivery 1 of 2 · Mon 12 Oct")).toBeTruthy();
  expect(screen.getByText("Shop A, delivery 2 of 2 · Tue 20 Oct")).toBeTruthy();
  expect(screen.getAllByText("Delivery 1 of 2 from Shop A").length).toBe(1);
  expect(screen.getAllByText("Delivery 2 of 2 from Shop A").length).toBe(1);

  // One control for the shop, on its first delivery, already ticked.
  const choices = screen.getAllByRole("checkbox", { name: "Deliver separately" });
  expect(choices).toHaveLength(1);
  expect(choices[0].props.accessibilityState).toMatchObject({ checked: true });
});
