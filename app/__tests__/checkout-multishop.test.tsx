import { cleanup, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CheckoutScreen from "@/app/checkout";
import type { Cart } from "@/lib/api";
import { MULTI_SHOP_PAYMENT_TITLE } from "@/lib/basketGroups";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { datedCart, MULTI_SETTINGS, multiCart } from "@/test/multiShopFixtures";

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

    expect(screen.getByLabelText(/^Shop A\. Needed by Mon 26 Oct\. 1 item\. ₱440\.00/)).toBeTruthy();
    expect(screen.getByLabelText(/^Shop B\. Needed by Mon 26 Oct\. 1 item\. ₱198\.00/)).toBeTruthy();
    expect(screen.getByText("Delivery from Shop A")).toBeTruthy();
    expect(screen.getByText("Delivery from Shop B")).toBeTruthy();
    expect(screen.getByText("Away")).toBeTruthy();
    expect(screen.getByText("Delivery · Shop A")).toBeTruthy();
    expect(screen.getByText("Delivery · Shop B")).toBeTruthy();
    expect(screen.getByText("Add more from Shop A for Mon 26 Oct")).toBeTruthy();
    expect(screen.getByText("Add more from Shop B for Mon 26 Oct")).toBeTruthy();
    expect(screen.getByText("Add products")).toBeTruthy();

    // ₱440 + ₱198 printing, ₱25 + ₱50 delivery: ₱713, all of it now, even
    // though the platform setting is still 75%.
    expect(screen.getByText("₱638.00")).toBeTruthy();
    expect(screen.getAllByText("₱713.00").length).toBeGreaterThan(1);
    expect(screen.getByText("Pay in full now")).toBeTruthy();
    expect(screen.getByText(MULTI_SHOP_PAYMENT_TITLE)).toBeTruthy();
    expect(screen.getByText(/goes out as 2 shops/)).toBeTruthy();
    expect(screen.queryByText(/75%|25%|Before delivery/)).toBeNull();

    // Each group says its date (here, the older basket's one date), with a way to move it.
    expect(screen.getAllByText("Needed by Mon 26 Oct")).toHaveLength(2);
    expect(screen.getAllByLabelText(/: Needed by Mon 26 Oct\. Change the date\.$/)).toHaveLength(2);
    expect(screen.queryByText(/One date for the whole order/)).toBeNull();
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
    expect(screen.getByText(/goes out as 3 shops/)).toBeTruthy();
  });

  it("asks for a date on a group that has none, because each group goes out on its own", async () => {
    holding(multiCart(2, { deadline: null }));
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("2 SHOPS, ONE ORDER");

    expect(screen.getAllByText("No set date — as soon as it is ready")).toHaveLength(2);
    expect(screen.getAllByText("Choose")).toHaveLength(2);
    expect(screen.getByLabelText("Shop A: No set date — as soon as it is ready. Choose a date.")).toBeTruthy();
  });

  /*
   * Per-product dates (gridgo-client#189): one shop on two dates is two
   * groups under one letter, each with its own date and delivery fee.
   */
  it("lays out two shops on three dates, soonest first, each with its own delivery", async () => {
    holding(datedCart());
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("2 SHOPS, 3 DATES, ONE ORDER");

    const headers = screen.getAllByRole("header").map((node) => node.props.accessibilityLabel as string);
    expect(headers.filter((label) => /^Shop [AB]\. Needed by/.test(label))).toEqual([
      expect.stringMatching(/^Shop A\. Needed by Mon 12 Oct\. 1 item\. ₱79\.20/),
      expect.stringMatching(/^Shop B\. Needed by Fri 16 Oct\. 1 item\. ₱198\.00/),
      expect.stringMatching(/^Shop A\. Needed by Tue 20 Oct\. 1 item\. ₱440\.00/),
    ]);
    // Two "Shop A" deliveries are two charges, told apart by date.
    expect(screen.getByText("Delivery · Shop A · Mon 12 Oct")).toBeTruthy();
    expect(screen.getByText("Delivery · Shop B · Fri 16 Oct")).toBeTruthy();
    expect(screen.getByText("Delivery · Shop A · Tue 20 Oct")).toBeTruthy();
    expect(screen.getByText("Add more from Shop A for Mon 12 Oct")).toBeTruthy();
    expect(screen.getByText("Add more from Shop A for Tue 20 Oct")).toBeTruthy();
    // Paid in full, with the reason in shops and dates.
    expect(screen.getByText(/goes out as 2 shops on 3 dates/)).toBeTruthy();
    expect(screen.getAllByText("₱817.20").length).toBeGreaterThan(1);
    // The old block is gone.
    expect(screen.queryByText(/shares one date|One date for the whole order/)).toBeNull();
  });

  it("keeps a group's missing delivery price as unknown, never zero", async () => {
    const cart = multiCart(2);
    cart.groups![1] = { ...cart.groups![1], deliveryFeeMinor: null, totalMinor: null };
    // GRIDGO's quote says the same: no delivery figure, so no total.
    cart.clientQuote = {
      ...cart.clientQuote!,
      status: "incomplete",
      reasons: [{ code: "dropoff_required", lineIds: ["cline_1"] }],
      deliveryFeeMinor: null,
      totalMinor: null,
      downpaymentMinor: null,
      balanceMinor: null,
    };
    holding(cart);
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("2 SHOPS, ONE ORDER");

    expect(screen.getAllByText("Set with your address").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not yet").length).toBeGreaterThan(0);
    expect(screen.queryByText("₱0.00")).toBeNull();
  });
});
