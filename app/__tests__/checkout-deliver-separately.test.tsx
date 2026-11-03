import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";
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

// One press per file: see "Running and testing" in AGENTS.md.
// gridgo-api#275: one shop on two dates travels together by the earlier date.
it("says the shop is due by its earliest date and splits it on request", async () => {
  const cart = combinedShopCart();
  seed(cart);
  api.setCartDeliveries.mockResolvedValue(splitShopCart());

  await renderInSafeArea(<CheckoutScreen />);
  expect(await screen.findByText("Delivered together by Mon 12 Oct, the earliest date here.")).toBeTruthy();
  const choice = screen.getByRole("checkbox", { name: "Deliver separately" });
  expect(choice.props.accessibilityState).toMatchObject({ checked: false });
  expect(screen.getByText("One delivery for each date (Mon 12 Oct, Tue 20 Oct), each with its own delivery fee.")).toBeTruthy();

  await fireEvent.press(choice);

  expect(api.setCartDeliveries).toHaveBeenCalledWith(cart.id, "cline_0", "by_deadline");
});
