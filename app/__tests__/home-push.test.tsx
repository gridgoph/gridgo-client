import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import { useCart } from "@/store/cart";
import { usePush } from "@/store/push";
import { useRequestDraft } from "@/store/requestDraft";
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
  api.listOrders.mockReset();
  api.listOrders.mockResolvedValue([]);
  useCart.getState().reset();
  useRequestDraft.getState().reset();
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
 * Home is where every client lands, so it is where the way to turn phone
 * notifications on has to be — after "Not now" on the explainer, or after
 * Android has blocked them. It draws nothing once they are on.
 */
function pushPermission(permission: "undetermined" | "blocked" | "granted") {
  usePush.setState({ supported: true, permission, busy: false, error: null });
}

it("offers phone notifications on Home while this phone has not said yes", async () => {
  pushPermission("undetermined");
  await renderInSafeArea(<HomeScreen />);

  expect(await screen.findByText("Get these on your phone")).toBeTruthy();
  expect(screen.getByText("Turn on notifications")).toBeTruthy();
});

it("points a blocked phone at its settings, from Home", async () => {
  pushPermission("blocked");
  await renderInSafeArea(<HomeScreen />);

  expect(await screen.findByText("Notifications are off for GRIDGO")).toBeTruthy();
  expect(screen.getByText("Open phone settings")).toBeTruthy();
});

it("draws no card once notifications are on", async () => {
  pushPermission("granted");
  await renderInSafeArea(<HomeScreen />);

  expect(await screen.findByText("START YOUR FIRST PRINT")).toBeTruthy();
  expect(screen.queryByText("Get these on your phone")).toBeNull();
  expect(screen.queryByText("Notifications are off for GRIDGO")).toBeNull();
});
