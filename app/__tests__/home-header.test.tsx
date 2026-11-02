import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import { useCart } from "@/store/cart";
import { useSession } from "@/store/session";

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
    getProductCategories: jest.fn(async () => []),
    getCart: jest.fn(async () => null),
    getHomeSummary: jest.fn(async () => null),
    getFeaturedPrints: jest.fn(async () => ({ items: [] })),
    saveAccountThemePreference: jest.fn(async (value: string) => value),
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

beforeEach(() => {
  mockPush.mockClear();
  useCart.getState().reset();
  useSession.setState({
    user: {
      id: "user_1",
      name: "Rina Cruz",
      email: "rina@example.com",
      role: "client",
      accountType: "business",
      orgName: "Cruz Signs",
    },
    token: "tok_test",
  } as never);
});

/**
 * Home's header is the mark, the basket and the light/dark switch (client#335).
 * Chat moved into the "+" sheet, where it sits with its hours and unread count.
 */
describe("Home's header controls", () => {
  it("carries the cart and the theme switch beside the mark, and no chat", async () => {
    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByLabelText("Your order, empty")).toBeTruthy();
    expect(screen.getByLabelText("Light theme")).toBeTruthy();
    expect(screen.getByLabelText("Dark theme")).toBeTruthy();
    expect(screen.queryByLabelText("Chat")).toBeNull();
    expect(screen.getByLabelText("GRIDGO Business")).toBeTruthy();
    expect(screen.queryByText("Rina Cruz")).toBeNull();
  });

  // One press per file section: this goes last.
  it("opens checkout from the cart", async () => {
    await renderInSafeArea(<HomeScreen />);
    fireEvent.press(await screen.findByLabelText("Your order, empty"));
    expect(mockPush).toHaveBeenCalledWith("/checkout");
  });
});
