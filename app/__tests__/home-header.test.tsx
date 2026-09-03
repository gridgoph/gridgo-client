import { fireEvent, render, screen, within } from "@testing-library/react-native";
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
 * The two controls in Home's header row. They are read as a pair, so they are
 * asserted as a pair: both present, both reachable, and neither carrying
 * anything it cannot back up with data.
 */
describe("Home's header controls", () => {
  it("carries both the cart and chat, beside the mark", async () => {
    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByLabelText("Your order, empty")).toBeTruthy();
    expect(screen.getByLabelText("Chat")).toBeTruthy();
    expect(screen.getByLabelText("GRIDGO Business")).toBeTruthy();
    expect(screen.queryByText("Cruz Signs")).toBeNull();
    expect(screen.queryByText("Rina Cruz")).toBeNull();
  });

  it("opens checkout from the cart", async () => {
    await renderInSafeArea(<HomeScreen />);

    fireEvent.press(await screen.findByLabelText("Your order, empty"));
    expect(mockPush).toHaveBeenCalledWith("/checkout");
  });

  it("opens the chat list from chat", async () => {
    await renderInSafeArea(<HomeScreen />);

    fireEvent.press(await screen.findByLabelText("Chat"));
    expect(mockPush).toHaveBeenCalledWith("/chat");
  });

  it("puts no unread badge on chat, because there is no count to show", async () => {
    // The cart's badge is data; a dot on chat would be decoration wearing
    // data's clothes. Scoped to the control, because Home carries other
    // numerals of its own — the how-it-works rail counts its steps.
    await renderInSafeArea(<HomeScreen />);

    const chat = within(await screen.findByLabelText("Chat"));
    expect(chat.queryByText("1")).toBeNull();
    expect(chat.queryByText("9+")).toBeNull();
  });
});
