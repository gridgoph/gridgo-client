import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import NotificationsScreen from "@/app/(tabs)/notifications";
import type { Notification } from "@/lib/api";
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
    markNotificationRead: jest.fn(),
    markAllNotificationsRead: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

/*
 * One job, five steps: what the audit screenshots showed as five cards each
 * repeating "Now: final payment … is being checked".
 */
const JOB = "ord_1f0948e867ca";
const payment = {
  installment: "final_online" as const,
  status: "pending_confirmation" as const,
  amountMinor: 33625,
};
const steps: Notification[] = [
  ["ntf_5", "Out for delivery", "2026-09-20T15:00:00+08:00", "order_out_for_delivery"],
  ["ntf_4", "A rider is on the way to the shop", "2026-09-20T13:00:00+08:00", "order_rider_assigned"],
  ["ntf_3", "Packed and ready", "2026-09-20T11:00:00+08:00", "order_ready_for_dispatch"],
  ["ntf_2", "Printing has started", "2026-09-19T10:00:00+08:00", "order_in_production"],
  ["ntf_1", "Your artwork passed its check", "2026-09-18T09:00:00+08:00", "order_approved"],
].map(([id, title, at, type]) => ({
  id,
  userId: "user_client",
  type,
  orderId: JOB,
  orderTitle: "Booth backdrops",
  orderState: "out_for_delivery",
  paymentAction: payment,
  title,
  body: `${title}.`,
  read: false,
  at,
}));
const broadcast: Notification = {
  id: "ntf_ann",
  userId: "user_client",
  title: "Holiday hours",
  body: "GRIDGO Office is closed on Monday.",
  read: false,
  at: "2026-09-19T08:00:00+08:00",
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

describe("NotificationsScreen, one card per job", () => {
  beforeEach(() => {
    mockPush.mockClear();
    api.markNotificationRead.mockReset();
    useNotifications.setState({
      items: [],
      readIds: [],
      snapshot: null,
      loading: false,
      error: null,
    });
    api.listNotifications.mockResolvedValue({
      notifications: [...steps, broadcast],
      snapshot: "ntf_5",
    });
    api.markNotificationRead.mockImplementation((id: string) =>
      Promise.resolve({ id, read: true }),
    );
    api.markAllNotificationsRead.mockResolvedValue(6);
  });

  it("draws one card for the job, with the payment line once", async () => {
    await renderInSafeArea(<NotificationsScreen />);

    expect(await screen.findByText("Out for delivery")).toBeTruthy();
    // The payment is the one thing to know, said once, as the card's callout.
    expect(screen.getAllByTestId("notification-callout")).toHaveLength(1);
    expect(screen.getAllByText("Final payment ₱336.25 is being checked")).toHaveLength(1);
    expect(screen.getByText("Do not pay again.")).toBeTruthy();
    expect(screen.getAllByLabelText(/^Stage \d of 4/)).toHaveLength(1);
    // The stage sits in the card's top strip, in words beside the meter.
    expect(screen.getByText("ON THE WAY TO YOU")).toBeTruthy();
    expect(screen.getByText("Show 4 earlier updates")).toBeTruthy();
    // Earlier steps stay folded until asked for.
    expect(screen.queryByText("Printing has started")).toBeNull();
    // A broadcast has no job, so it stays a card of its own.
    expect(screen.getByText("Holiday hours")).toBeTruthy();
    // Two cards unread, not six rows — each carries the unread spine.
    expect(screen.getByText("2 unread")).toBeTruthy();
    expect(screen.getAllByTestId("notification-unread-spine", { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.getByLabelText("Mark all as read")).toBeTruthy();
  });

  it("reads as read once the job's newest update is read", async () => {
    api.listNotifications.mockResolvedValue({
      notifications: [{ ...steps[0], read: true }, ...steps.slice(1)],
      snapshot: "ntf_5",
    });
    await renderInSafeArea(<NotificationsScreen />);

    await screen.findByText("Out for delivery");
    expect(screen.queryByText("1 unread")).toBeNull();
    expect(screen.queryByText(/unread/)).toBeNull();
    expect(screen.queryByTestId("notification-unread-spine", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByLabelText("Mark all as read")).toBeNull();
  });

  it("marks every update in the card read from the accessibility action", async () => {
    api.listNotifications.mockResolvedValue({ notifications: steps, snapshot: "ntf_5" });
    await renderInSafeArea(<NotificationsScreen />);

    const card = await screen.findByLabelText(/^Unread\. .*Out for delivery/);
    await fireEvent(card, "accessibilityAction", {
      nativeEvent: { actionName: "markRead" },
    });

    await waitFor(() =>
      expect([...useNotifications.getState().readIds].sort()).toEqual(
        ["ntf_1", "ntf_2", "ntf_3", "ntf_4", "ntf_5"],
      ),
    );
    expect(api.markNotificationRead).toHaveBeenCalledTimes(5);
  });

  it("opens the job and marks all its updates read", async () => {
    await renderInSafeArea(<NotificationsScreen />);

    await fireEvent.press(await screen.findByText("Out for delivery"));

    expect(mockPush).toHaveBeenCalledWith(`/order/${JOB}`);
    await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalledTimes(5));
    expect(api.markNotificationRead).not.toHaveBeenCalledWith("ntf_ann", true);
  });

  it("unfolds the earlier updates as the job's timeline, newest first", async () => {
    await renderInSafeArea(<NotificationsScreen />);

    await fireEvent.press(await screen.findByLabelText("Show 4 earlier updates"));

    expect(await screen.findByText("Printing has started")).toBeTruthy();
    const timeline = screen.getByTestId("notification-timeline");
    const titles = [
      "A rider is on the way to the shop",
      "Packed and ready",
      "Printing has started",
      "Your artwork passed its check",
    ];
    for (const title of titles) {
      expect(within(timeline).getByText(title)).toBeTruthy();
    }
    // The day is a heading, said once, not a stamp repeated on every row.
    const day = new Date("2026-09-20T13:00:00+08:00").toLocaleDateString("en-PH", {
      day: "numeric",
      month: "short",
    });
    expect(within(timeline).getAllByText(day)).toHaveLength(1);
    // Each row still carries its exact stamp for a screen reader.
    expect(
      within(timeline).getByLabelText(/^Printing has started, .*(AM|PM)$/),
    ).toBeTruthy();
    expect(screen.getByText("Hide earlier updates")).toBeTruthy();
    // Unfolding is reading the history, not opening the job.
    expect(mockPush).not.toHaveBeenCalled();
  });
});
