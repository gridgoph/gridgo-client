import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import { useCart } from "@/store/cart";
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
 * Home is a summary: anything waiting on the client, then how to start
 * something new. It is not a second orders list — that is the tab below.
 */
describe("Home as a summary", () => {
  it("invites a first print, searchable, when there are no jobs", async () => {
    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByText("START YOUR FIRST PRINT")).toBeTruthy();
    expect(screen.queryByText("START A PRINT")).toBeNull();
    expect(screen.getByLabelText("Search what GRIDGO prints")).toBeTruthy();
    expect(screen.getByLabelText("Marketing & promotional collateral")).toBeTruthy();
    expect(screen.getByLabelText("Documents & publications")).toBeTruthy();
    expect(screen.queryByText("NEEDS YOU")).toBeNull();
    expect(screen.queryByText("YOUR JOBS")).toBeNull();
    expect(screen.queryByText("IN PROGRESS")).toBeNull();
    expect(screen.queryByText("RECENTLY FINISHED")).toBeNull();
    expect(screen.queryByText("View all")).toBeNull();
    expect(screen.queryByText("No print jobs yet")).toBeNull();
  });
});
