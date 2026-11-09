import { act, render, screen } from "@testing-library/react-native";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import * as api from "@/lib/api";
import { invalidate } from "@/lib/live";
import { useCart } from "@/store/cart";
import { useHomeSummary } from "@/store/homeSummary";
import { useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";

let mockFocused = true;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual("react");
    const focused = mockFocused;
    useEffect(() => focused ? effect() : undefined, [effect, focused]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listOrders: jest.fn(),
  getFeaturedPrints: jest.fn(),
  getProductCategories: jest.fn(async () => []),
  getHomeSummary: jest.fn(async () => null),
  getTesterProgram: jest.fn(async () => ({ enrolled: false })),
  listNotifications: jest.fn(async () => ({ notifications: [], snapshot: null })),
  getSeasonWindows: jest.fn(async () => ({ windows: [], banners: [] })),
  getAccount: jest.fn(async () => { throw new Error("offline"); }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const featured = {
  items: [{
    id: "flyers", name: "Featured flyers", categoryCode: "marketing_collateral", subcategoryCode: "flyers",
    clientFromPriceMinor: 49500, pricingUnit: "per_unit", packageQty: null, measureUnit: null,
    minimumOrderQuantity: null, photos: [],
  }],
};
const pastOrder = { id: "ord_1", title: "Event tarpaulin", state: "completed", createdAt: "2026-11-01T00:00:00Z" } as api.Order;

async function openHome() {
  return render(<HomeScreen />, {
    wrapper: ({ children }) => (
      <SafeAreaProvider initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}>{children}</SafeAreaProvider>
    ),
  });
}

const advance = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  jest.useFakeTimers();
  mockFocused = true;
  Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
  jest.mocked(api.listOrders).mockReset().mockResolvedValue([]);
  jest.mocked(api.getFeaturedPrints).mockReset().mockResolvedValue({ items: [] });
  useHomeSummary.getState().clear();
  useRequestDraft.getState().reset();
  useCart.getState().reset();
  useCart.setState({ hydrated: true });
  useSession.setState({
    user: { id: "user_1", name: "Rina Cruz", email: "rina@example.com", role: "client", accountType: "individual" },
  });
});

afterEach(() => jest.useRealTimers());

it("serializes focus and repeated invalidations into one batch and one dirty follow-up", async () => {
  const orders = deferred<api.Order[]>();
  const prints = deferred<unknown>();
  const nextOrders = deferred<api.Order[]>();
  const nextPrints = deferred<unknown>();
  jest.mocked(api.listOrders).mockReturnValueOnce(orders.promise).mockReturnValueOnce(nextOrders.promise);
  jest.mocked(api.getFeaturedPrints).mockReturnValueOnce(prints.promise).mockReturnValueOnce(nextPrints.promise);
  await openHome();
  await advance(80);

  for (let i = 0; i < 3; i++) {
    invalidate("orders");
    await advance(100);
  }
  expect(api.listOrders).toHaveBeenCalledTimes(1);
  expect(api.getFeaturedPrints).toHaveBeenCalledTimes(1);

  // One panel can land while another is pending; the guard still owns the batch.
  await act(async () => orders.resolve([pastOrder]));
  expect(screen.getByLabelText("Reorder Event tarpaulin")).toBeTruthy();
  expect(screen.getByTestId("featured-waiting")).toBeTruthy();
  await advance(100);
  expect(api.listOrders).toHaveBeenCalledTimes(1);

  await act(async () => prints.resolve(featured));
  expect(screen.getByText("Featured flyers")).toBeTruthy();
  await advance(80);
  expect(api.listOrders).toHaveBeenCalledTimes(2);
  expect(api.getFeaturedPrints).toHaveBeenCalledTimes(2);
  await act(async () => { nextOrders.resolve([]); nextPrints.resolve({ items: [] }); });
  await advance(500);
  expect(api.listOrders).toHaveBeenCalledTimes(2);
  expect(api.getFeaturedPrints).toHaveBeenCalledTimes(2);
});

it("renders featured prints while orders are pending and keeps waiting after a panel fails", async () => {
  const orders = deferred<api.Order[]>();
  const categories = deferred<Awaited<ReturnType<typeof api.getProductCategories>>>();
  jest.mocked(api.listOrders).mockReturnValueOnce(orders.promise);
  jest.mocked(api.getFeaturedPrints).mockResolvedValueOnce(featured);
  jest.mocked(api.getProductCategories).mockReturnValueOnce(categories.promise);
  await openHome();
  await advance(80);
  expect(screen.getByText("Featured flyers")).toBeTruthy();
  expect(screen.getByLabelText("Reorder. No past print yet")).toBeTruthy();

  invalidate("catalog");
  await advance(100);
  await act(async () => orders.reject(new Error("offline")));
  await advance(100);
  expect(api.listOrders).toHaveBeenCalledTimes(1);
  await act(async () => categories.resolve([]));
  await advance(80);
  expect(api.listOrders).toHaveBeenCalledTimes(2);
});

it("drops a queued follow-up and late panel answers on blur", async () => {
  const orders = deferred<api.Order[]>();
  const prints = deferred<unknown>();
  jest.mocked(api.listOrders).mockReturnValueOnce(orders.promise);
  jest.mocked(api.getFeaturedPrints).mockReturnValueOnce(prints.promise);
  const home = await openHome();
  await advance(80);
  invalidate("orders");
  await advance(100);
  mockFocused = false;
  await home.rerender(<HomeScreen />);
  await act(async () => { orders.resolve([pastOrder]); prints.resolve(featured); });
  await advance(500);
  expect(screen.queryByLabelText("Reorder Event tarpaulin")).toBeNull();
  expect(screen.queryByText("Featured flyers")).toBeNull();
  expect(api.listOrders).toHaveBeenCalledTimes(1);
  expect(api.getFeaturedPrints).toHaveBeenCalledTimes(1);
});
