import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrdersScreen from "@/app/(tabs)/orders";

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
  };
});

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
});

describe("Orders header", () => {
  it("carries cart and chat, and drops the helper line", async () => {
    await renderInSafeArea(<OrdersScreen />);

    expect(await screen.findByText("Orders")).toBeTruthy();
    expect(screen.getByLabelText("Your order, empty")).toBeTruthy();
    expect(screen.getByLabelText("Chat")).toBeTruthy();
    expect(
      screen.queryByText("Open a job to approve your artwork, pay, or follow the delivery."),
    ).toBeNull();
  });

  it("opens checkout from the cart", async () => {
    await renderInSafeArea(<OrdersScreen />);

    fireEvent.press(await screen.findByLabelText("Your order, empty"));
    expect(mockPush).toHaveBeenCalledWith("/checkout");
  });
});
