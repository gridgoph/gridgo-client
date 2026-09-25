import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import NotificationsScreen from "@/app/(tabs)/notifications";
import type { Notification } from "@/lib/api";
import { useAppUpdate } from "@/store/appUpdate";
import { useNotifications } from "@/store/notifications";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
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

const installed = { versionCode: 95, versionName: "1.0.95" };
const latest = { versionCode: 96, versionName: "1.0.96" };

const assignment: Notification = {
  id: "ntf_1",
  userId: "user_client",
  type: "supplier_assignment_final_price",
  orderId: "ord_demo_1",
  orderTitle: "Grand opening tarpaulin",
  orderState: "production",
  title: "Supplier assigned and final price ready",
  body: "A supplier accepted your order.",
  read: false,
  at: "2026-08-09T09:12:00+08:00",
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

// The app-update card is local to the phone; the order list, its empty state
// and its unread line must read exactly as they did without it.
describe("NotificationsScreen with an app update waiting", () => {
  beforeEach(() => {
    useAppUpdate.getState().reset();
    useAppUpdate.setState({ installed, latest });
    useNotifications.setState({
      items: [assignment],
      readIds: [],
      snapshot: null,
      loading: false,
      error: null,
    });
    api.listNotifications.mockResolvedValue({ notifications: [assignment], snapshot: "ntf_1" });
    api.listOrders.mockResolvedValue([]);
  });

  it("pins the update above the jobs without counting it as unread", async () => {
    await renderInSafeArea(<NotificationsScreen />);

    const rows = await screen.findAllByText(
      /^(App update available: version 1\.0\.96|Supplier assigned and final price ready)$/,
    );
    expect(rows.map((row) => row.props.children)).toEqual([
      "App update available: version 1.0.96",
      "Supplier assigned and final price ready",
    ]);
    expect(screen.getByText("1 unread")).toBeTruthy();
  });

  it("keeps the empty state for a client with no job updates", async () => {
    useNotifications.setState({ items: [] });
    api.listNotifications.mockResolvedValue({ notifications: [], snapshot: null });
    await renderInSafeArea(<NotificationsScreen />);

    expect(screen.getByText("App update available: version 1.0.96")).toBeTruthy();
    expect(await screen.findByText("You are all caught up")).toBeTruthy();
    expect(screen.queryByText(/unread/)).toBeNull();
  });

  it("shows the Updated item once the phone is on the new build", async () => {
    useAppUpdate.setState({
      installed: latest,
      latest,
      updatedNotice: { build: latest, at: Date.now() },
    });
    await renderInSafeArea(<NotificationsScreen />);

    expect(screen.getByText("Updated to version 1.0.96")).toBeTruthy();
    expect(screen.queryByText(/App update available/)).toBeNull();
    expect(await screen.findByText(assignment.title)).toBeTruthy();
  });
});
