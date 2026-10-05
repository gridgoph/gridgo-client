import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhenScreen from "@/app/request/when";
import type { Cart, CartLineRecord } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useJobFulfilment } from "@/store/jobFulfilment";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, deadlineDays: jest.fn(() => new Promise(() => {})), matchShop: jest.fn(() => new Promise(() => {})) };
});

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ subcategory: "flyers", category: "marketing_collateral" }),
}));

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

const HOME = { lat: 7.0731, lng: 125.6128, label: "Bajada, Davao City" };

function basket(requestFulfillment: Cart["requestFulfillment"]): Cart {
  return {
    id: "cart_1", state: "draft", version: 1, serviceLevel: "standard", scheduledFor: null,
    fulfillmentMode: "delivery", defaultDropoff: HOME, requestFulfillment,
    lines: [{ id: "cline_1", supplierId: "user_shop" } as CartLineRecord],
    checkedOutOrderId: null, createdAt: "2026-10-05T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z",
  };
}

/*
  Delivery or pick-up comes straight after the date (#158) — unless the basket
  has already settled it. Each test presses once (AGENTS.md).
*/
describe("after the date", () => {
  beforeEach(() => {
    mockPush.mockReset();
    api.matchShop.mockClear();
    useJobFulfilment.getState().clear();
  });

  it("joins a basket that already chose, skipping the question and matching on its point", async () => {
    useCart.setState({ cartId: "cart_1", cart: basket({ fulfillmentMode: "delivery", dropoff: HOME }) });
    await renderInSafeArea(<WhenScreen />);

    fireEvent.press(screen.getByText("No rush — show me anyone"));

    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/request/rank" }));
    expect(useJobFulfilment.getState().choice).toEqual({ fulfillmentMode: "delivery", dropoff: HOME });
    expect(api.matchShop).toHaveBeenCalledWith(
      expect.objectContaining({ fulfillmentMode: "delivery", dropoff: HOME }),
    );
  });

  it("leaves a basket from before the question on its old flow", async () => {
    useCart.setState({ cartId: "cart_1", cart: basket(null) });
    await renderInSafeArea(<WhenScreen />);

    fireEvent.press(screen.getByText("No rush — show me anyone"));

    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/request/rank" }));
    expect(useJobFulfilment.getState().choice).toBeNull();
    expect(api.matchShop.mock.calls[0][0]).not.toHaveProperty("fulfillmentMode");
  });
});
