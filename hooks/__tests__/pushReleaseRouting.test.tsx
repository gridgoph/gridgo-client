import { act, renderHook, waitFor } from "@testing-library/react-native";
import { Linking, Platform } from "react-native";

import { usePushNotifications } from "../usePushNotifications";

/**
 * Release pushes (gridgo-api `docs/RELEASE_ANNOUNCEMENTS_API.md`): a tap opens
 * this install's own store, and a store install never opens the APK download.
 */

const mockRouter = { push: jest.fn() };
type PushResponse = {
  notification: { request: { identifier: string; content: { data: unknown; title: string } } };
};
let mockTap: (value: PushResponse) => void;
const mockNative = {
  setNotificationHandler: jest.fn(),
  clearLastNotificationResponseAsync: jest.fn(async () => {}),
  addNotificationResponseReceivedListener: (listener: typeof mockTap) => {
    mockTap = listener;
    return { remove: jest.fn() };
  },
  addNotificationReceivedListener: () => ({ remove: jest.fn() }),
  addPushTokenListener: () => ({ remove: jest.fn() }),
  getLastNotificationResponseAsync: jest.fn(async () => null),
};
jest.mock("@/lib/api", () => ({
  getOrder: jest.fn(),
  getSupportChatThread: jest.fn(),
  markNotificationRead: jest.fn(),
  onUnauthorized: jest.fn(),
}));
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useRootNavigationState: () => ({ key: "root" }),
  useSegments: () => ["(tabs)", "home"],
}));
jest.mock("@/store/push", () => ({
  getNotificationsNative: () => mockNative,
  pushSupported: () => true,
  usePush: { getState: () => ({ registerIfGranted: jest.fn(async () => {}) }) },
}));

const tap = (identifier: string, data: Record<string, string>, title: string): PushResponse => ({
  notification: { request: { identifier, content: { data, title } } },
});

let openURL: jest.SpyInstance;
beforeEach(() => {
  mockRouter.push.mockClear();
  openURL = jest.spyOn(Linking, "openURL").mockClear().mockResolvedValue(true);
});
afterEach(() => {
  delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
  jest.restoreAllMocks();
});

it("opens the Play listing from a Play notice on a Play build", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "play";
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => {
    mockTap(tap("play", { type: "announcement", releaseChannel: "play", storeTarget: "play_store" }, "GRIDGO Client 1.0.130 is on the Play Store"));
  });
  await waitFor(() => expect(openURL).toHaveBeenCalledWith("market://details?id=ph.gridgo.client"));
  expect(openURL).not.toHaveBeenCalledWith(expect.stringContaining(".apk"));
  expect(mockRouter.push).not.toHaveBeenCalled();
  await hook.unmount();
});

it("opens TestFlight from a TestFlight notice on an iPhone", async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => {
    mockTap(tap("ios", { type: "announcement", releaseChannel: "ios", storeTarget: "testflight" }, "GRIDGO Client 1.0.130 is in TestFlight"));
  });
  await waitFor(() => expect(openURL).toHaveBeenCalledWith("itms-beta://"));
  await hook.unmount();
});

it("keeps the APK download for an APK notice on a side-loaded build", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => {
    mockTap(tap("apk", { type: "announcement", releaseChannel: "apk", storeTarget: "apk_download" }, "GRIDGO Client 1.0.130 is ready"));
  });
  await waitFor(() => expect(openURL).toHaveBeenCalledWith("https://gridgo.talasora.com/downloads/gridgo-client.apk"));
  await hook.unmount();
});

it("never opens the APK download from an APK notice on an iPhone", async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => {
    mockTap(tap("apk-ios", { type: "announcement" }, "GRIDGO Client 1.0.130 is ready"));
  });
  expect(openURL).not.toHaveBeenCalled();
  await hook.unmount();
});
