import { act, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import type { Order } from "@/lib/api";
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
    listOrders: jest.fn(),
    listCatalog: jest.fn(async () => []),
    getProductCategories: jest.fn(async () => []),
    getCart: jest.fn(async () => null),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    state: "production",
    productId: "prod_tarpaulin",
    title: "Grand opening tarpaulin",
    quantity: 1,
    size: "3x6 ft",
    material: "13oz tarpaulin",
    deadline: null,
    address: "JP Laurel Ave",
    zone: "davao_central",
    subtotalMinor: 110000,
    deliveryFeeMinor: 2500,
    totalMinor: 112500,
    downpaymentMinor: 84375,
    balanceMinor: 28125,
    paymentMethod: "qr_manual",
    paymentStatus: "downpayment_confirmed",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-08T10:00:00+08:00",
    updatedAt: "2026-08-09T10:00:00+08:00",
    timeline: [],
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

beforeEach(() => {
  mockPush.mockClear();
  api.listOrders.mockReset();
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

describe("Home's jobs slot", () => {
  it("leads with the next verb, then the jobs merely in progress", async () => {
    api.listOrders.mockResolvedValue([
      order({ id: "ord_proof", state: "proof_approval", title: "Business cards" }),
      order({ id: "ord_print", state: "production", title: "Event flyers" }),
    ]);

    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByText("NEEDS YOU")).toBeTruthy();
    expect(screen.getByText("Approve your artwork proof")).toBeTruthy();
    expect(screen.getByText("Business cards")).toBeTruthy();
    // The job that needs nothing is still on Home, but under the docket.
    expect(screen.getByText("IN PROGRESS")).toBeTruthy();
    expect(screen.getByText("Event flyers")).toBeTruthy();
    const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
    expect(labels.indexOf("Approve your artwork proof, Business cards")).toBeLessThan(
      labels.indexOf("In production, Event flyers"),
    );
    expect(screen.queryByText("Order this again")).toBeNull();
    expect(screen.queryByText(/₱/)).toBeNull();
    expect(screen.queryByText("proof_approval")).toBeNull();
  });
});

let mockRefresh: () => Promise<void>;
jest.mock("@/hooks/useLiveRefresh", () => ({
  useLiveRefresh: (_resources: unknown, refresh: () => Promise<void>) => { mockRefresh = refresh; },
}));

it("keeps the newer Home jobs when the focus read finishes late", async () => {
  let finish!: (orders: Order[]) => void;
  api.listOrders.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  api.listOrders.mockResolvedValue([order({ title: "Current job" })]);
  await renderInSafeArea(<HomeScreen />);
  await act(async () => { await mockRefresh(); });
  expect(screen.getByText("Current job")).toBeTruthy();
  await act(async () => { finish([order({ title: "Old job" })]); });
  expect(screen.getByText("Current job")).toBeTruthy();
  expect(screen.queryByText("Old job")).toBeNull();
});
