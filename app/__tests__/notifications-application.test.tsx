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

const mockSentBack: Notification = {
  id: "ntf_app",
  userId: "u1",
  type: "approval_rejected",
  title: "Application needs changes",
  body: "Upload your school recognition certificate again. Everything else you sent is kept.",
  read: false,
  at: "2026-10-06T06:30:00+08:00",
};

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listNotifications: jest.fn(async () => ({ notifications: [mockSentBack], snapshot: "ntf_app" })),
    listOrders: jest.fn(async () => []),
    markNotificationRead: jest.fn(async () => ({ ...mockSentBack, read: true })),
  };
});

// One press per file (AGENTS.md): this file is the application notification's tap.
it("names what to fix on a sent-back application and opens the application when tapped", async () => {
  useNotifications.setState({ items: [], readIds: [], snapshot: null, loading: false, error: null });
  useSession.setState({
    user: {
      id: "u1",
      email: "pta@school.edu.ph",
      name: "Ana Reyes",
      role: "client",
      accountType: "individual",
      version: 3,
      approvalCase: { id: "apc_1", kind: "business_client", status: "rejected", version: 2 },
    },
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

  expect(await screen.findByText(mockSentBack.body)).toBeTruthy();
  expect(screen.getByText("Fix your application")).toBeTruthy();
  await fireEvent.press(screen.getByText("Application needs changes"));
  expect(mockPush).toHaveBeenCalledWith("/business-apply");
});
