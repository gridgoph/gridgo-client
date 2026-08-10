import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import NotificationsScreen from "@/app/(tabs)/notifications";
import type { Notification, Order } from "@/lib/api";
import { useNotifications } from "@/store/notifications";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, listNotifications: jest.fn(), listOrders: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const assignment: Notification = {
  id: "ntf_1",
  userId: "user_client",
  type: "supplier_assignment_final_price",
  orderId: "ord_demo_1",
  title: "Supplier assigned and final price ready",
  body: "A supplier accepted your order. Review the final price and submit the digital downpayment.",
  read: false,
  at: "2026-08-09T09:12:00+08:00",
};

const order: Order = {
  id: "ord_demo_1",
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
};

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

describe("NotificationsScreen", () => {
  beforeEach(() => {
    mockPush.mockClear();
    useNotifications.setState({ items: [], readIds: [], loading: false, error: null });
    api.listNotifications.mockResolvedValue([assignment]);
    api.listOrders.mockResolvedValue([order]);
  });

  it("shows where the job actually is, not only that something changed", async () => {
    await renderInSafeArea(<NotificationsScreen />);

    expect(await screen.findByText(assignment.title)).toBeTruthy();
    // The legacy rail, against this app's own stages.
    expect(screen.getByText("Order")).toBeTruthy();
    expect(screen.getByText("Printing")).toBeTruthy();
    expect(screen.getByText("Dispatch")).toBeTruthy();
    expect(screen.getByText("Delivered")).toBeTruthy();
    expect(screen.getByLabelText("Stage 2 of 4: Printing")).toBeTruthy();
  });

  it("stamps the update with the date and the time", async () => {
    await renderInSafeArea(<NotificationsScreen />);

    expect(await screen.findByText(/Aug 9, .*(AM|PM)/)).toBeTruthy();
  });

  it("marks an update read without a swipe, for anyone who cannot make one", async () => {
    await renderInSafeArea(<NotificationsScreen />);

    const row = await screen.findByLabelText(/^Unread\./);
    fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "markRead" } });

    await waitFor(() => expect(useNotifications.getState().readIds).toContain("ntf_1"));
  });

  it("opens the job the update is about", async () => {
    await renderInSafeArea(<NotificationsScreen />);

    fireEvent.press(await screen.findByText(assignment.title));

    expect(mockPush).toHaveBeenCalledWith("/order/ord_demo_1");
  });

  it("draws no stage rail for an update with no job behind it", async () => {
    api.listNotifications.mockResolvedValue([
      { ...assignment, id: "ntf_2", type: undefined, orderId: undefined },
    ]);
    await renderInSafeArea(<NotificationsScreen />);

    await screen.findByText(assignment.title);
    expect(screen.queryByText("Dispatch")).toBeNull();
  });

  it("still lists the updates when the jobs behind them cannot be loaded", async () => {
    api.listOrders.mockRejectedValue(new Error("Network request failed"));
    await renderInSafeArea(<NotificationsScreen />);

    expect(await screen.findByText(assignment.title)).toBeTruthy();
    expect(screen.queryByText("Dispatch")).toBeNull();
  });

  it("invites the next action rather than shrugging when there is nothing", async () => {
    api.listNotifications.mockResolvedValue([]);
    await renderInSafeArea(<NotificationsScreen />);

    expect(await screen.findByText("You are all caught up")).toBeTruthy();
  });
});
