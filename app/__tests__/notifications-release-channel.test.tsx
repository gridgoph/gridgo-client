import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import NotificationsScreen from "@/app/(tabs)/notifications";
import type { Notification } from "@/lib/api";
import { useNotifications } from "@/store/notifications";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listNotifications: jest.fn(),
  listOrders: jest.fn(async () => []),
  markNotificationRead: jest.fn(async () => undefined),
  markAllNotificationsRead: jest.fn(async () => 1),
}));

// The captain's iPhone: a TestFlight install.
jest.mock("@/lib/buildDistribution", () => ({
  ...jest.requireActual("@/lib/buildDistribution"),
  appInstallChannel: () => "ios",
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api") as { listNotifications: jest.Mock };

const release = (id: string, title: string, extra: Partial<Notification> = {}): Notification =>
  ({
    id,
    userId: "user_client",
    type: "announcement",
    title,
    body: "Update now for the latest fixes and features.",
    read: false,
    at: `2026-10-17T0${id.length % 9}:00:00+08:00`,
    ...extra,
  }) as Notification;

const inbox = [
  release("apk185", "GRIDGO Client 1.0.185 is ready", { releaseChannel: "apk", storeTarget: "apk_download" }),
  release("ios5", "GRIDGO Client 1.0.5 is in TestFlight", { releaseChannel: "ios", storeTarget: "testflight" }),
  release("apk182", "GRIDGO Client 1.0.182 is ready"),
  release("ios4", "GRIDGO Client 1.0.4 is in TestFlight", { releaseChannel: "ios", storeTarget: "testflight" }),
];

beforeEach(() => {
  useNotifications.getState().setOwner("user_client");
  api.listNotifications.mockResolvedValue({ notifications: inbox, snapshot: "ios5" });
});

it("lists and counts only an iPhone's TestFlight notices, and a tap opens TestFlight", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <NotificationsScreen />
    </SafeAreaProvider>,
  );

  expect(await screen.findByText("2 unread")).toBeTruthy();
  expect(screen.getByText("GRIDGO Client 1.0.5 is in TestFlight")).toBeTruthy();
  expect(screen.getByText("GRIDGO Client 1.0.4 is in TestFlight")).toBeTruthy();
  expect(screen.queryByText("GRIDGO Client 1.0.185 is ready")).toBeNull();
  expect(screen.queryByText("GRIDGO Client 1.0.182 is ready")).toBeNull();

  fireEvent.press(screen.getByText("GRIDGO Client 1.0.5 is in TestFlight"));
  await waitFor(() => expect(open).toHaveBeenCalledWith("itms-beta://"));
  open.mockRestore();
});
