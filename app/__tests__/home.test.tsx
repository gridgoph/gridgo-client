import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import { useCart } from "@/store/cart";
import { useHomeSummary } from "@/store/homeSummary";
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
  useHomeSummary.getState().clear();
  api.listOrders.mockReset();
  api.listOrders.mockResolvedValue([]);
  api.getHomeSummary.mockReset();
  api.getHomeSummary.mockRejectedValue(new Error("offline"));
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
 * Home is one screen (client#335): a search that greets the client, Featured
 * Prints, the five families as round buttons, the smart tile and Reorder.
 * The job lists live on Orders.
 */
describe("Home on one screen", () => {
  it("greets the client by first name in the search", async () => {
    await renderInSafeArea(<HomeScreen />);
    expect(await screen.findByPlaceholderText("Hello Rina, what are we printing?")).toBeTruthy();
  });

  it("draws the families as round buttons and keeps job lists off Home", async () => {
    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByLabelText("Marketing & promotional collateral")).toBeTruthy();
    expect(screen.getByText("Marketing")).toBeTruthy();
    expect(screen.getByText("Docs")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Shop by category" })).toBeTruthy();
    expect(screen.queryByText("IN PROGRESS")).toBeNull();
    expect(screen.queryByText("RECENTLY FINISHED")).toBeNull();
    expect(screen.queryByText("START YOUR FIRST PRINT")).toBeNull();
  });

  it("keeps Reorder in place, disabled, before there is a past print", async () => {
    await renderInSafeArea(<HomeScreen />);
    const reorder = await screen.findByLabelText("Reorder. No past print yet");
    expect(reorder.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it("offers the newest past order on the Reorder tile", async () => {
    api.listOrders.mockResolvedValue([
      { id: "ord_old", title: "Old flyers", state: "completed", createdAt: "2026-08-01T00:00:00Z" },
      { id: "ord_new", title: "Event tarpaulin", state: "completed", createdAt: "2026-09-01T00:00:00Z" },
    ]);
    await renderInSafeArea(<HomeScreen />);
    expect(await screen.findByLabelText("Reorder Event tarpaulin")).toBeTruthy();
  });

  it("shows the smart tile GRIDGO's summary names", async () => {
    api.getHomeSummary.mockResolvedValue({
      serverTime: "2026-11-02T08:00:00.000Z",
      tile: "active_order",
      missions: null,
      activeOrder: {
        orderId: "ord_1", state: "production", step: 2, stepKey: "printing", stepCount: 4,
        fulfillmentMode: "delivery", basketId: null, awaitingPayment: false,
        promisedAt: "2026-11-04T09:00:00.000Z", statusAt: "2026-11-02T03:10:00.000Z",
        time: { kind: "promised", at: "2026-11-04T09:00:00.000Z" },
      },
      activeOrderCount: 1,
      testerVoucher: null,
      bugReport: { rewardAvailable: false, amountMinor: 1500 },
    });
    await renderInSafeArea(<HomeScreen />);
    expect(await screen.findByLabelText("Your order, Printing")).toBeTruthy();
    expect(screen.getByText(/^Ready by Wed/)).toBeTruthy();
  });
});
