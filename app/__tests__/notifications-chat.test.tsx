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

const THREAD = "0f8b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const mockSupport: Notification = {
  id: "ntf_support",
  userId: "u1",
  type: "support_message",
  threadId: THREAD,
  title: "New message from GRIDGO",
  body: "Open GRIDGO to read it.",
  read: false,
  at: "2026-10-14T06:30:00+08:00",
};

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listNotifications: jest.fn(async () => ({ notifications: [mockSupport], snapshot: "ntf_support" })),
    listOrders: jest.fn(async () => []),
    markNotificationRead: jest.fn(async () => ({ ...mockSupport, read: true })),
  };
});

// One press per file (AGENTS.md): this file is an Operations message's tap.
it("opens an Operations message in its own support thread (#231)", async () => {
  useNotifications.setState({ items: [], readIds: [], snapshot: null, loading: false, error: null });
  useSession.setState({
    user: { id: "u1", email: "client@gridgo.local", name: "Client", role: "client" },
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

  await fireEvent.press(await screen.findByText(mockSupport.title));
  expect(mockPush).toHaveBeenCalledWith(`/chat/${THREAD}`);
});
