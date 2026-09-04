import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhereScreen from "@/app/request/where";
import type { Cart, ClientAddress } from "@/lib/api";
import { useCart } from "@/store/cart";

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ next: "checkout" }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listAddresses: jest.fn(),
    saveAddress: jest.fn(),
    setCartDropoffs: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const HOME: ClientAddress = {
  id: "addr_home",
  label: "Home",
  addressLine: "12 Quimpo Blvd, Davao City",
  point: { lat: 7.049, lng: 125.588, label: "12 Quimpo Blvd, Davao City" },
  isDefault: true,
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const CART: Cart = {
  id: "cart_1",
  state: "draft",
  version: 1,
  serviceLevel: "standard",
  scheduledFor: null,
  fulfillmentMode: "delivery",
  defaultDropoff: HOME.point,
  lines: [],
  checkedOutOrderId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
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

describe("Where is it going? saved row", () => {
  it("applies a saved address and continues to checkout", async () => {
    api.listAddresses.mockResolvedValue([HOME]);
    api.setCartDropoffs.mockResolvedValue(CART);
    useCart.setState({ cartId: "cart_1", cart: CART });

    await renderInSafeArea(<WhereScreen />);
    fireEvent.press(await screen.findByLabelText("Deliver to Home"));

    await waitFor(() => {
      expect(api.setCartDropoffs).toHaveBeenCalledWith("cart_1", {
        defaultDropoff: { ...HOME.point, label: HOME.addressLine },
      });
    });
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/checkout",
      params: {},
    });
  });
});
