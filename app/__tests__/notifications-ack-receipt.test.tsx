import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import NotificationsScreen from "@/app/(tabs)/notifications";
import type { Notification } from "@/lib/api";
import { useNotifications } from "@/store/notifications";
import { useSession } from "@/store/session";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args), navigate: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

const mockIssued: Notification = {
  id: "ntf_ar",
  userId: "u1",
  orderId: "ord_1",
  orderTitle: "Grand opening flyers",
  orderState: "out_for_delivery",
  fulfillmentMode: "delivery",
  type: "acknowledgement_receipt_ready",
  title: "Acknowledgement receipt ready",
  body: "Your delivery acknowledgement receipt is available on the order.",
  read: false,
  at: "2026-10-21T09:00:00+08:00",
};

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listNotifications: jest.fn(async () => ({ notifications: [mockIssued], snapshot: "ntf_ar" })),
    listOrders: jest.fn(async () => []),
    markNotificationRead: jest.fn(async () => ({ ...mockIssued, read: true })),
  };
});

// One press per file (AGENTS.md): this file is the acknowledgement receipt notice's tap.
it("opens the acknowledgement receipt the rider issued at the door", async () => {
  useNotifications.setState({ items: [], readIds: [], snapshot: null, loading: false, error: null });
  useSession.setState({
    user: { id: "u1", email: "client@example.com", name: "Maria Santos", role: "client", accountType: "individual", version: 1 },
    source: "clerk",
    loading: false,
    error: null,
  });
  await render(<NotificationsScreen />, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });

  expect(await screen.findByText("Your acknowledgement receipt is ready")).toBeTruthy();
  await fireEvent.press(screen.getByText("Your acknowledgement receipt is ready"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/order/acknowledgement-receipt",
    params: { orderId: "ord_1" },
  });
});
