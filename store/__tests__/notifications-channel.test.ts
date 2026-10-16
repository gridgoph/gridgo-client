import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Notification } from "@/lib/api";
import { appInstallChannel } from "@/lib/buildDistribution";
import { countUnreadGroups, useNotifications } from "@/store/notifications";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listNotifications: jest.fn(),
  markNotificationRead: jest.fn(async () => undefined),
  markAllNotificationsRead: jest.fn(async () => 1),
}));

jest.mock("@/lib/buildDistribution", () => ({
  ...jest.requireActual("@/lib/buildDistribution"),
  appInstallChannel: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api") as {
  listNotifications: jest.Mock;
  markNotificationRead: jest.Mock;
  markAllNotificationsRead: jest.Mock;
};

const row = (id: string, title: string, extra: Partial<Notification> = {}): Notification =>
  ({
    id,
    userId: "user_client",
    type: "announcement",
    title,
    body: "Update now for the latest fixes and features.",
    read: false,
    at: "2026-10-17T02:00:00+08:00",
    ...extra,
  }) as Notification;

/** The captain's inbox, as GRIDGO serves it to an account with an APK and an iPhone. */
const inbox = [
  row("apk185", "GRIDGO Client 1.0.185 is ready", { releaseChannel: "apk", storeTarget: "apk_download" }),
  row("ios5", "GRIDGO Client 1.0.5 is in TestFlight", { releaseChannel: "ios", storeTarget: "testflight" }),
  row("legacy", "GRIDGO Client 1.0.182 is ready"),
  row("play5", "GRIDGO Client 1.0.5 is on the Play Store", { releaseChannel: "play", storeTarget: "play_store" }),
  row("job", "Your order is printing", { type: "order_updated", orderId: "ord_1", orderState: "production" }),
];

async function loadOn(channel: "apk" | "play" | "ios" | null) {
  (appInstallChannel as jest.Mock).mockReturnValue(channel);
  api.listNotifications.mockResolvedValue({ notifications: inbox, snapshot: "job" });
  await useNotifications.getState().refresh();
  return useNotifications.getState();
}

const ids = () => useNotifications.getState().items.map((item) => item.id);

beforeEach(async () => {
  await AsyncStorage.clear();
  useNotifications.getState().setOwner(null);
  useNotifications.getState().setOwner("user_client");
  api.markNotificationRead.mockClear();
  api.markAllNotificationsRead.mockClear();
});

it("keeps only TestFlight release notices on an iPhone, and counts only those", async () => {
  const state = await loadOn("ios");
  expect(ids()).toEqual(["ios5", "job"]);
  expect(countUnreadGroups(state.items, state.readIds)).toBe(2);
});

it("keeps only Play release notices on a Play install", async () => {
  await loadOn("play");
  expect(ids()).toEqual(["play5", "job"]);
});

it("keeps APK release notices on an APK install, the ones from before channels included", async () => {
  await loadOn("apk");
  expect(ids()).toEqual(["apk185", "legacy", "job"]);
});

it("keeps no release notice on web, which is not an install", async () => {
  await loadOn(null);
  expect(ids()).toEqual(["job"]);
});

it("marks only this install's rows read while another install's are unread, never read-all", async () => {
  await loadOn("ios");
  await useNotifications.getState().markAllRead();

  // read-all would also mark the APK phone's notices; they are hidden, not ours.
  expect(api.markAllNotificationsRead).not.toHaveBeenCalled();
  expect(api.markNotificationRead.mock.calls.map(([id]) => id)).toEqual(["ios5", "job"]);
  const state = useNotifications.getState();
  expect(countUnreadGroups(state.items, state.readIds)).toBe(0);
});

it("still uses read-all when nothing is hidden unread", async () => {
  (appInstallChannel as jest.Mock).mockReturnValue("ios");
  api.listNotifications.mockResolvedValue({
    notifications: inbox.map((item) => (item.id === "ios5" || item.id === "job" ? item : { ...item, read: true })),
    snapshot: "job",
  });
  await useNotifications.getState().refresh();
  await useNotifications.getState().markAllRead();

  expect(api.markAllNotificationsRead).toHaveBeenCalledWith("job");
  expect(api.markNotificationRead).not.toHaveBeenCalled();
});
