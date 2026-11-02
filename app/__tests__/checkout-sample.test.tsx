import { cleanup, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CheckoutScreen from "@/app/checkout";
import type { Cart } from "@/lib/api";
import { useBasketGroupTarget } from "@/store/basketGroup";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { DATE_MID, MULTI_SETTINGS, multiCart } from "@/test/multiShopFixtures";

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

/** One shop on one date: GRIDGO still sends its one group, as "Shop A". */
function singleGroupCart(overrides: Partial<Cart> = {}): Cart {
  const base = multiCart(2);
  const group = { ...base.groups![0], deadline: DATE_MID };
  const line = { ...base.lines[0], deadline: DATE_MID };
  return {
    ...base,
    id: "cart_single",
    deadline: DATE_MID,
    isMultiGroup: false,
    groupCount: 1,
    shopCount: 1,
    groups: [group],
    lines: [line],
    clientQuote: {
      ...base.clientQuote!,
      clientItemSubtotalMinor: group.clientItemSubtotalMinor,
      deliveryLines: [base.clientQuote!.deliveryLines[0]],
      deliveryFeeMinor: group.deliveryFeeMinor,
      totalMinor: group.totalMinor,
      downpaymentMinor: group.totalMinor,
    },
    ...overrides,
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

function seed(cart: Cart) {
  mockPush.mockClear();
  api.getSettings.mockResolvedValue(MULTI_SETTINGS);
  api.getCart.mockResolvedValue(cart);
  api.listAddresses.mockResolvedValue([]);
  useCheckoutPayment.getState().reset();
  useBasketGroupTarget.getState().clear();
  useCart.setState({ cartId: cart.id, cart, loading: false, busy: false, error: null, hydrated: true });
}

afterEach(async () => {
  await cleanup();
});

// No presses: rendering only.
it("offers nothing else to add to a sample basket, and says why (gridgo-api#222)", async () => {
  const cart = singleGroupCart();
  seed({
    ...cart,
    lines: [
      {
        ...cart.lines[0],
        quantity: 1,
        sample: { batchQuantity: 5, replacesSampleBatchId: null },
        listing: cart.lines[0].listing ? { ...cart.lines[0].listing, pricingUnit: "per_package", packageQty: 100 } : null,
      },
    ],
  });

  await renderInSafeArea(<CheckoutScreen />);
  expect(await screen.findByText("A sample, or a batch from one, is ordered on its own.")).toBeTruthy();
  expect(screen.getByText(/^Sample · 1 piece\. Your batch of 5 packs \(500 pieces\) is saved/)).toBeTruthy();
  expect(screen.queryByLabelText("Add more from this shop")).toBeNull();
  expect(screen.queryByLabelText("Add something else to print")).toBeNull();
});

it("lets a batch from a sample change only its quantity (gridgo-api#222)", async () => {
  const cart = singleGroupCart();
  seed({
    ...cart,
    lines: [
      {
        ...cart.lines[0],
        quantity: 10,
        sampleBatch: { draftId: "sbd_1", pricing: "held", sampleOrderId: "ord_s", heldUntil: "2026-11-16T16:00:00.000Z" },
      },
    ],
  });

  await renderInSafeArea(<CheckoutScreen />);
  expect(await screen.findByText(/^Batch from your approved sample, at the held price until .+\. Only the quantity can change\.$/)).toBeTruthy();
  expect(screen.queryByLabelText("Edit")).toBeNull();
  expect(screen.queryByLabelText(/^(Add artwork|Artwork)$/)).toBeNull();
  expect(screen.queryByText(/Change what you picked/)).toBeNull();
  // The quantity still steps.
  expect(screen.getAllByLabelText(/^One more /).length).toBeGreaterThan(0);
});

it("keeps both ways to add more on an ordinary basket", async () => {
  seed(singleGroupCart());

  await renderInSafeArea(<CheckoutScreen />);
  expect(await screen.findByLabelText("Add more from this shop")).toBeTruthy();
  expect(screen.getByLabelText("Add something else to print")).toBeTruthy();
  expect(screen.queryByText("A sample, or a batch from one, is ordered on its own.")).toBeNull();
});
