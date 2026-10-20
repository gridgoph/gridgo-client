import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";
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

// One press per test: see "Running and testing" in AGENTS.md.
it("adds more to a one-shop order from that shop's own products (report 75DCBF4A)", async () => {
  seed(singleGroupCart());

  await renderInSafeArea(<CheckoutScreen />);
  expect(await screen.findByText("Add more from this shop")).toBeTruthy();
  // Never the run wording, and never a letter the client has not been shown.
  expect(screen.queryByText(/this run/)).toBeNull();
  expect(screen.queryByText(/Shop A/)).toBeNull();
  await fireEvent.press(screen.getByLabelText("Add more from this shop"));

  expect(useBasketGroupTarget.getState()).toMatchObject({
    groupId: "cline_0",
    label: "this shop",
    deadline: DATE_MID,
  });
  expect(mockPush).toHaveBeenCalledWith("/request/add-more");
  expect(mockPush).not.toHaveBeenCalledWith("/request/category");
});

it("still opens the category picker for an older cart without groups", async () => {
  seed(singleGroupCart({ groups: undefined, isMultiGroup: undefined }));

  await renderInSafeArea(<CheckoutScreen />);
  await fireEvent.press(await screen.findByLabelText("Add more from this shop"));

  expect(useBasketGroupTarget.getState().groupId).toBeNull();
  expect(mockPush).toHaveBeenCalledWith("/request/category");
});
