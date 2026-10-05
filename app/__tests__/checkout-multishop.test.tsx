import { cleanup, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CheckoutScreen from "@/app/checkout";
import type { Cart } from "@/lib/api";
import { BASKET_DATE_MISSING, MULTI_SHOP_PAYMENT_TITLE } from "@/lib/basketGroups";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { MULTI_SETTINGS, multiCart } from "@/test/multiShopFixtures";

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
    setCartFulfilment: jest.fn(),
    setCartDropoffs: jest.fn(),
    listAddresses: jest.fn(),
    updateCartLine: jest.fn(),
    removeCartLine: jest.fn(),
    checkoutCart: jest.fn(),
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

function holding(cart: Cart) {
  api.getCart.mockResolvedValue(cart);
  useCart.setState({ cartId: cart.id, cart, loading: false, busy: false, error: null, hydrated: true });
}

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  jest.clearAllMocks();
  useCheckoutPayment.getState().reset();
  api.getSettings.mockResolvedValue(MULTI_SETTINGS);
  api.listAddresses.mockResolvedValue([]);
});

/*
 * A basket printed by several shops (gridgo-api#117). GRIDGO's own groups
 * carry the money; no shop is named and no shop board is read.
 */
describe("CheckoutScreen, several shops", () => {
  it("groups two shops, each with its own delivery fee, into one total paid in full", async () => {
    holding(multiCart(2));
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("2 SHOPS, ONE ORDER");

    expect(screen.getByLabelText(/^Shop A\. 1 item\. ₱440\.00/)).toBeTruthy();
    expect(screen.getByLabelText(/^Shop B\. 1 item\. ₱198\.00/)).toBeTruthy();
    expect(screen.getByText("Delivery from Shop A")).toBeTruthy();
    expect(screen.getByText("Delivery from Shop B")).toBeTruthy();
    expect(screen.getByText("Away")).toBeTruthy();
    expect(screen.getByText("Delivery · Shop A")).toBeTruthy();
    expect(screen.getByText("Delivery · Shop B")).toBeTruthy();
    expect(screen.getByText("Add more from Shop A")).toBeTruthy();
    expect(screen.getByText("Add more from Shop B")).toBeTruthy();
    expect(screen.getByText("Add products")).toBeTruthy();

    // ₱440 + ₱198 printing, ₱25 + ₱50 delivery: ₱713, all of it now, even
    // though the platform setting is still 75%.
    expect(screen.getByText("₱638.00")).toBeTruthy();
    expect(screen.getAllByText("₱713.00").length).toBeGreaterThan(1);
    expect(screen.getByText("Pay in full now")).toBeTruthy();
    expect(screen.getByText(MULTI_SHOP_PAYMENT_TITLE)).toBeTruthy();
    expect(screen.getByText(/printed by 2 shops/)).toBeTruthy();
    expect(screen.queryByText(/75%|25%|Before delivery/)).toBeNull();

    // The one date, shown once above the groups.
    expect(screen.getByText(/One date for the whole order/)).toBeTruthy();
    // No shop is measured from its pin: a multi-shop basket has none to read.
    expect(api.getCatalogShop).not.toHaveBeenCalled();
  });

  it("lays out three shops and adds them to one total", async () => {
    holding(multiCart(3));
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("3 SHOPS, ONE ORDER");

    expect(screen.getByTestId("shop-group-A")).toBeTruthy();
    expect(screen.getByTestId("shop-group-B")).toBeTruthy();
    expect(screen.getByTestId("shop-group-C")).toBeTruthy();
    expect(screen.getByText("Delivery · Shop C")).toBeTruthy();
    // ₱717.20 printing + ₱100 delivery.
    expect(screen.getByText("₱717.20")).toBeTruthy();
    expect(screen.getAllByText("₱817.20").length).toBeGreaterThan(1);
    expect(screen.getByText(/printed by 3 shops/)).toBeTruthy();
  });

  it("asks for one date when the basket reached several shops without one", async () => {
    holding(multiCart(2, { deadline: null }));
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("2 SHOPS, ONE ORDER");

    expect(screen.getByText("No date yet")).toBeTruthy();
    expect(screen.getByText(BASKET_DATE_MISSING)).toBeTruthy();
    expect(screen.getByLabelText(BASKET_DATE_MISSING)).toBeTruthy();
  });

  it("keeps a group's missing delivery price as unknown, never zero", async () => {
    const cart = multiCart(2);
    cart.groups![1] = { ...cart.groups![1], deliveryFeeMinor: null, totalMinor: null };
    holding(cart);
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("2 SHOPS, ONE ORDER");

    expect(screen.getAllByText("Set with your address").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not yet").length).toBeGreaterThan(0);
    expect(screen.queryByText("₱0.00")).toBeNull();
  });
});
