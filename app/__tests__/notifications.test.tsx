import { invalidate } from "@/lib/live";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import NotificationsScreen from "@/app/(tabs)/notifications";
import type { Notification, Order } from "@/lib/api";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useNotifications } from "@/store/notifications";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
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
    listNotifications: jest.fn(),
    listOrders: jest.fn(),
    markNotificationRead: jest.fn(),
    markAllNotificationsRead: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const assignment: Notification = {
  id: "ntf_1",
  userId: "user_client",
  type: "supplier_assignment_final_price",
  orderId: "ord_demo_1",
  orderTitle: "Grand opening tarpaulin",
  orderState: "production",
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
    useNotifications.setState({
      items: [],
      readIds: [],
      snapshot: null,
      loading: false,
      error: null,
    });
    api.listNotifications.mockResolvedValue({
      notifications: [assignment],
      snapshot: assignment.id,
    });
    api.listOrders.mockResolvedValue([order]);
    api.markNotificationRead.mockResolvedValue({ ...assignment, read: true });
    api.markAllNotificationsRead.mockResolvedValue(1);
  });

  it("updates the visible inbox from a silent cross-device hint", async () => {
    await renderInSafeArea(<NotificationsScreen />);
    expect(await screen.findByText(assignment.title)).toBeTruthy();
    api.listNotifications.mockResolvedValue({
      notifications: [{ ...assignment, id: "new", title: "Payment checked" }],
      snapshot: "new",
    });
    await act(async () => {
      invalidate("notifications");
    });
    expect(await screen.findByText("Payment checked")).toBeTruthy();
  });

  it("shows where the job actually is, not only that something changed", async () => {
    await renderInSafeArea(<NotificationsScreen />);

    expect(await screen.findByText(assignment.title)).toBeTruthy();
    // The legacy rail as a meter at the top of the card, with the stage named.
    expect(screen.getByLabelText("Stage 2 of 4: Printing")).toBeTruthy();
    expect(screen.getByText("PRINTING")).toBeTruthy();
    // The job is on the press, so the old "pay" ask is not called out.
    expect(screen.queryByTestId("notification-callout")).toBeNull();
  });

  it("says how long ago it moved, and keeps the exact stamp for a screen reader", async () => {
    await renderInSafeArea(<NotificationsScreen />);

    expect(await screen.findByText(formatRelativeTime(assignment.at))).toBeTruthy();
    expect(screen.getByLabelText(/Aug 9, .*(AM|PM)$/)).toBeTruthy();
  });

  it("marks an update read without a swipe, for anyone who cannot make one", async () => {
    await renderInSafeArea(<NotificationsScreen />);

    const row = await screen.findByLabelText(/^Unread\./);
    await fireEvent(row, "accessibilityAction", {
      nativeEvent: { actionName: "markRead" },
    });

    await waitFor(() =>
      expect(useNotifications.getState().readIds).toContain("ntf_1"),
    );
    expect(api.markNotificationRead).toHaveBeenCalledWith("ntf_1", true);
  });

  it("opens the job the update is about", async () => {
    await renderInSafeArea(<NotificationsScreen />);

    await fireEvent.press(await screen.findByText(assignment.title));

    expect(mockPush).toHaveBeenCalledWith("/order/ord_demo_1");
  });

  it("paints cached updates on the first frame without waiting on the network", async () => {
    useNotifications.setState({
      items: [assignment],
      loading: false,
      error: null,
    });
    api.listNotifications.mockReturnValue(new Promise(() => {}));

    await renderInSafeArea(<NotificationsScreen />);

    expect(screen.getByText(assignment.title)).toBeTruthy();
    expect(screen.queryByText("Loading your updates…")).toBeNull();
    expect(screen.getByLabelText("Stage 2 of 4: Printing")).toBeTruthy();
    expect(api.listOrders).not.toHaveBeenCalled();
  });

  it("draws no stage rail for an update with no job behind it", async () => {
    api.listNotifications.mockResolvedValue({
      notifications: [
        {
          ...assignment,
          id: "ntf_2",
          type: undefined,
          orderId: undefined,
          orderTitle: undefined,
          orderState: undefined,
        },
      ],
      snapshot: "ntf_2",
    });
    await renderInSafeArea(<NotificationsScreen />);

    await screen.findByText(assignment.title);
    expect(screen.queryByText("Dispatch")).toBeNull();
  });

  it("still lists the updates when the jobs behind them cannot be loaded", async () => {
    api.listNotifications.mockResolvedValue({
      notifications: [
        { ...assignment, orderTitle: undefined, orderState: undefined },
      ],
      snapshot: assignment.id,
    });
    await renderInSafeArea(<NotificationsScreen />);

    expect(await screen.findByText(assignment.title)).toBeTruthy();
    expect(screen.queryByText("Dispatch")).toBeNull();
    expect(api.listOrders).not.toHaveBeenCalled();
  });

  it("invites the next action rather than shrugging when there is nothing", async () => {
    api.listNotifications.mockResolvedValue({
      notifications: [],
      snapshot: null,
    });
    await renderInSafeArea(<NotificationsScreen />);

    expect(await screen.findByText("You are all caught up")).toBeTruthy();
    expect(screen.getByText(/GRIDGO Office counter/)).toBeTruthy();
  });

  it("draws a collect job as a counter docket, not a door delivery", async () => {
    api.listNotifications.mockResolvedValue({
      notifications: [
        {
          ...assignment,
          id: "ntf_pick",
          type: "order_ready_for_pickup",
          orderTitle: "Seminar handouts",
          orderState: "awaiting_collection",
          fulfillmentMode: "pickup",
          collectHold: false,
          title: "Ready for pickup",
          body: "Your order is waiting for you at the GRIDGO Office counter.",
        },
      ],
      snapshot: "ntf_pick",
    });

    await renderInSafeArea(<NotificationsScreen />);

    expect(await screen.findByText("COLLECT AT THE COUNTER")).toBeTruthy();
    expect(screen.getByText("Waiting at the counter")).toBeTruthy();
    expect(screen.getByText("Seminar handouts")).toBeTruthy();
    expect(screen.getByText("NEEDS YOU")).toBeTruthy();
    expect(screen.getByLabelText("Stage 4 of 4: Counter")).toBeTruthy();
    expect(screen.getByText("Collect at GRIDGO Office")).toBeTruthy();
    expect(screen.getByText("Give the name you ordered under.")).toBeTruthy();
  });

  it("does not call a pickup on the way to the office a door delivery", async () => {
    api.listNotifications.mockResolvedValue({
      notifications: [
        {
          ...assignment,
          id: "ntf_office",
          type: "order_out_for_delivery",
          orderTitle: "Flyers",
          orderState: "out_for_delivery",
          fulfillmentMode: "pickup",
          title: "Out for delivery",
          body: "Your order is on the way.",
        },
      ],
      snapshot: "ntf_office",
    });

    await renderInSafeArea(<NotificationsScreen />);

    expect(await screen.findByText("On the way to GRIDGO Office")).toBeTruthy();
    expect(screen.getByText("COLLECT AT GRIDGO OFFICE")).toBeTruthy();
    expect(screen.queryByText("Out for delivery")).toBeNull();
    expect(screen.getByLabelText("Stage 3 of 4: To office")).toBeTruthy();
  });

  it("keeps cart and chat on the header, and drops the helper line", async () => {
    api.listNotifications.mockResolvedValue({
      notifications: [],
      snapshot: null,
    });
    await renderInSafeArea(<NotificationsScreen />);

    expect(await screen.findByLabelText("Your order, empty")).toBeTruthy();
    expect(screen.getByLabelText("Chat")).toBeTruthy();
    expect(
      screen.queryByText("Deadlines and status changes for your print jobs."),
    ).toBeNull();
    expect(
      screen.queryByText(
        "Tap an update to open the job, or swipe it left to mark it read.",
      ),
    ).toBeNull();
  });
});
