import { act, renderHook, waitFor } from "@testing-library/react-native";

import { usePushNotifications } from "../usePushNotifications";
import { getOrder, getSupportChatThread, markNotificationRead } from "@/lib/api";
import { useSession } from "@/store/session";

/**
 * Chat pushes (gridgo-client#231, gridgo-api `docs/REALTIME_EVENTS.md`
 * § Chat push delivery). A rider's message opens that delivery's chat; an
 * Operations message names no thread, so the tap reads the notice back to find
 * it and opens exactly that thread — or chat history, never a guess.
 */

const THREAD = "0f8b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const mockRouter = { push: jest.fn() };
let mockSegments = ["(tabs)", "home"];
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
  getLastNotificationResponseAsync: jest.fn(),
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
  useSegments: () => mockSegments,
}));
jest.mock("@/store/push", () => ({
  getNotificationsNative: () => mockNative,
  pushSupported: () => true,
  usePush: { getState: () => ({ registerIfGranted: jest.fn(async () => {}) }) },
}));

function response(identifier: string, data: Record<string, string>): PushResponse {
  return { notification: { request: { identifier, content: { data } } } };
}
const delivery = (identifier: string) =>
  response(identifier, { notificationId: "n-delivery", type: "delivery_message", orderId: "ord1" });
const support = (identifier: string) =>
  response(identifier, { notificationId: "n-support", type: "support_message" });

const signIn = () => useSession.setState({ user: { id: "client", role: "client" } as never });

beforeEach(() => {
  mockRouter.push.mockClear();
  mockSegments = ["(tabs)", "home"];
  mockNative.getLastNotificationResponseAsync.mockReset().mockResolvedValue(null);
  jest.mocked(getOrder).mockReset().mockResolvedValue({ id: "ord1" } as never);
  jest.mocked(markNotificationRead).mockReset().mockResolvedValue({ id: "n-support", threadId: THREAD } as never);
  jest.mocked(getSupportChatThread).mockReset().mockResolvedValue({ thread: { id: THREAD }, messages: [] } as never);
  useSession.setState({ user: null });
});

it("opens a rider's message in that delivery's chat from the background", async () => {
  signIn();
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => { mockTap(delivery("bg")); });
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/order/delivery-chat?orderId=ord1"));
  // Authorization is the API's: the order is read with this person's session first.
  expect(getOrder).toHaveBeenCalledWith("ord1");
  await hook.unmount();
});

it("holds a cold-start rider's message until sign-in and navigation are ready", async () => {
  mockSegments = ["(auth)", "login"];
  mockNative.getLastNotificationResponseAsync.mockResolvedValue(delivery("cold"));
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => { await Promise.resolve(); });
  await act(async () => { signIn(); });
  expect(mockRouter.push).not.toHaveBeenCalled();
  mockSegments = ["(tabs)", "home"];
  await hook.rerender({});
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/order/delivery-chat?orderId=ord1"));
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

it("sends a rider's message on an order this person cannot read to the inbox", async () => {
  signIn();
  jest.mocked(getOrder).mockRejectedValue(new Error("forbidden"));
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => { mockTap(delivery("bg")); });
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/(tabs)/notifications"));
  await hook.unmount();
});

it("reads an Operations message back for its thread, then opens exactly that thread", async () => {
  signIn();
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => { mockTap(support("bg")); });
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(`/chat/${THREAD}`));
  expect(markNotificationRead).toHaveBeenCalledWith("n-support");
  expect(getSupportChatThread).toHaveBeenCalledWith(THREAD);
  expect(jest.mocked(markNotificationRead).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(getSupportChatThread).mock.invocationCallOrder[0],
  );
  await hook.unmount();
});

it("does not read a cold-start Operations message back before sign-in is ready", async () => {
  mockSegments = ["(auth)", "login"];
  mockNative.getLastNotificationResponseAsync.mockResolvedValue(support("cold"));
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => { await Promise.resolve(); });
  // No session yet, so no bearer: the PATCH would be refused, or worse, sent
  // for whoever signs in next.
  expect(markNotificationRead).not.toHaveBeenCalled();
  await act(async () => { signIn(); });
  mockSegments = ["(tabs)", "home"];
  await hook.rerender({});
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(`/chat/${THREAD}`));
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

it.each([
  ["the notice is gone", () => jest.mocked(markNotificationRead).mockRejectedValue(new Error("notification_not_found"))],
  ["the notice names no thread", () => jest.mocked(markNotificationRead).mockResolvedValue({ id: "n-support" } as never)],
  ["the thread is not this person's or was removed", () => jest.mocked(getSupportChatThread).mockRejectedValue(new Error("not_found"))],
])("opens chat history when %s", async (_case, arrange) => {
  arrange();
  signIn();
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => { mockTap(support("bg")); });
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/chat"));
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

it("opens one tap once, even when the launch replay and the listener both hand it over", async () => {
  signIn();
  mockNative.getLastNotificationResponseAsync.mockResolvedValue(support("launch-replay"));
  const hook = await renderHook(() => usePushNotifications());
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(`/chat/${THREAD}`));
  // The same notice again, under the identifier the live listener reports.
  await act(async () => { mockTap(support("live-listener")); });
  await act(async () => { await Promise.resolve(); });
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  expect(markNotificationRead).toHaveBeenCalledTimes(1);
  await hook.unmount();
});
