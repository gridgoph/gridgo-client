import { act, renderHook, waitFor } from "@testing-library/react-native";

import { usePushNotifications } from "../usePushNotifications";
import { getExpressGroup, markNotificationRead } from "@/lib/api";
import { useSession } from "@/store/session";

/**
 * Group order pushes (gridgo-api#415). The push names no group, so a tap reads
 * the Alert back for its `groupId` and opens that group — or the inbox when
 * the person can no longer read it (removed, or the group is gone).
 */

const mockRouter = { push: jest.fn() };
type PushResponse = { notification: { request: { identifier: string; content: { data: unknown } } } };
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
  getExpressGroup: jest.fn(),
  getOrder: jest.fn(),
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

const tap = (identifier: string): PushResponse => ({
  notification: { request: { identifier, content: { data: { notificationId: "n-group", type: "group_on_the_way", orderId: "ord1" } } } },
});

beforeEach(() => {
  mockRouter.push.mockClear();
  jest.mocked(markNotificationRead).mockReset().mockResolvedValue({ id: "n-group", type: "group_on_the_way", groupId: "grp_1" } as never);
  jest.mocked(getExpressGroup).mockReset().mockResolvedValue({ id: "grp_1" } as never);
  useSession.setState({ user: { id: "client", role: "client" } as never });
});

it("reads a group push back and opens that group's shared tracking", async () => {
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => { mockTap(tap("a")); });
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/express/group/grp_1"));
  expect(markNotificationRead).toHaveBeenCalledWith("n-group");
  expect(getExpressGroup).toHaveBeenCalledWith("grp_1");
  await hook.unmount();
});

it("opens the inbox when the person can no longer read the group", async () => {
  jest.mocked(getExpressGroup).mockRejectedValue(new Error("group_membership_required"));
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => { mockTap(tap("b")); });
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/(tabs)/notifications"));
  await hook.unmount();
});
