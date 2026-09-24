import { render, screen } from "@testing-library/react-native";
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

/**
 * The captain's report: three finished jobs stacked as full cards pushed
 * "Start a print" down the screen, and a live job looked exactly like one
 * that was over. Live work leads; finished work is one quiet line each.
 */
describe("Home's jobs, live before finished", () => {
  it("puts the live job first as a card and folds finished jobs into compact rows", async () => {
    api.listOrders.mockResolvedValue([
      order({ id: "ord_a", state: "completed", title: "Menu boards" }),
      order({ id: "ord_b", state: "delivered", title: "Shop signage" }),
      order({ id: "ord_c", state: "out_for_delivery", title: "Event flyers" }),
      order({ id: "ord_d", state: "payout_released", title: "Staff shirts" }),
    ]);

    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByText("IN PROGRESS")).toBeTruthy();
    expect(screen.getByText("RECENTLY FINISHED")).toBeTruthy();

    const labels: string[] = screen
      .getAllByRole("button")
      .map((button) => button.props.accessibilityLabel as string);
    const live = labels.indexOf("Out for delivery, Event flyers");
    const finished = labels.findIndex((label) => label?.startsWith("Menu boards, Completed"));
    expect(live).toBeGreaterThanOrEqual(0);
    expect(finished).toBeGreaterThan(live);

    // Only the live job draws a stage rail; finished rows carry no rail.
    expect(screen.getAllByLabelText(/^Stage \d of 4/)).toHaveLength(1);
    expect(screen.getByLabelText("Stage 3 of 4: Dispatch")).toBeTruthy();
    expect(screen.getByText("Your order is out for delivery.")).toBeTruthy();

    // Finished rows: name plus the word and when, nothing else.
    expect(screen.getByText("Menu boards")).toBeTruthy();
    expect(screen.getByText("Shop signage")).toBeTruthy();
    expect(screen.getByText("Staff shirts")).toBeTruthy();
    expect(screen.getByText(/^Delivered /)).toBeTruthy();

    // One way to the full list, on the first of the two sections.
    expect(screen.getAllByText("View all")).toHaveLength(1);
    expect(screen.getByText("START A PRINT")).toBeTruthy();
    expect(screen.queryByText(/₱/)).toBeNull();
  });
});
