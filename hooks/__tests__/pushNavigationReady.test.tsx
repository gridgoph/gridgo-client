import { act, renderHook, waitFor } from "@testing-library/react-native";
import { usePushNotifications } from "../usePushNotifications";
import { getOrder } from "@/lib/api";
import { useSession } from "@/store/session";
const mockRouter = { push: jest.fn() };
let mockSegments = ["(auth)", "login"];
let mockTap: (value: ReturnType<typeof response>) => void;
const mockNative = {
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: (listener: typeof mockTap) => {
    mockTap = listener;
    return { remove: jest.fn() };
  },
  addNotificationReceivedListener: () => ({ remove: jest.fn() }),
  addPushTokenListener: () => ({ remove: jest.fn() }),
  getLastNotificationResponseAsync: jest.fn(),
};
jest.mock("@/lib/api", () => ({getOrder:jest.fn(async()=>({id:"order1"})),onUnauthorized:jest.fn()}));
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useRootNavigationState: () => ({ key: "root" }),
  useSegments: () => mockSegments,
}));
jest.mock("@/store/push", () => ({
  getNotificationsNative: () => mockNative,
  pushSupported: () => true,
  usePush: {
    getState: () => ({
      registerIfGranted: jest.fn(async () => {}),
      release: jest.fn(),
    }),
  },
}));
function response(identifier: string, orderId: string) {
  return { notification: { request: { identifier, content: {
    data: { notificationId: identifier, type: "payment_confirmed", orderId },
  } } } };
}

beforeEach(() => {
  mockRouter.push.mockClear();
  mockSegments = ["(auth)", "login"];
  mockNative.getLastNotificationResponseAsync.mockReset().mockResolvedValue(response("cold-tap", "order1"));
  jest.mocked(getOrder).mockReset().mockResolvedValue({ id: "order1" } as never);
  useSession.setState({ user: null });
});

it("retains a cold tap until the authenticated navigation tree has actually mounted", async () => {
  useSession.setState({ user: null });
  const view = await renderHook(() => usePushNotifications());
  await act(async () => {
    await Promise.resolve();
  });
  expect(mockRouter.push).not.toHaveBeenCalled();
  await act(async () => {
    useSession.setState({ user: { id: "client", role: "client" } as never });
  });
  expect(mockRouter.push).not.toHaveBeenCalled();
  mockSegments = ["(tabs)", "home"];
  await view.rerender({});
  await waitFor(() =>
    expect(mockRouter.push).toHaveBeenCalledWith("/order/order1"),
  );
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  await view.unmount();
});

it.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])("keeps the latest tap when an older lookup finishes: deferred=%s failure=%s", async (deferred, fails) => {
  mockNative.getLastNotificationResponseAsync.mockResolvedValue(null);
  let finish!: () => void;
  let fail!: (error: Error) => void;
  jest.mocked(getOrder).mockImplementationOnce(() => new Promise((resolve, reject) => {
    finish = () => resolve({ id: "order-a" } as never);
    fail = reject;
  }));
  if (!deferred) {
    mockSegments = ["(tabs)", "home"];
    useSession.setState({ user: { id: "client", role: "client" } as never });
  }
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => { mockTap(response("tap-a", "order-a")); });
  if (deferred) {
    await act(async () => {
      useSession.setState({ user: { id: "client", role: "client" } as never });
    });
    mockSegments = ["(tabs)", "home"];
    await hook.rerender({});
  }
  await waitFor(() => expect(getOrder).toHaveBeenCalledWith("order-a"));
  await act(async () => { mockTap(response("tap-b", "order-b")); });
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/order/order-b"));
  await act(async () => {
    if (fails) fail(new Error("Old lookup failed"));
    else finish();
  });
  expect(mockRouter.push.mock.calls).toEqual([["/order/order-b"]]);
  await hook.unmount();
});

it("does not let delayed launch-response replay replace a live tap", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  mockNative.getLastNotificationResponseAsync.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  mockSegments = ["(tabs)", "home"];
  useSession.setState({ user: { id: "client", role: "client" } as never });
  const hook = await renderHook(() => usePushNotifications());
  await act(async () => { mockTap(response("live", "latest")); });
  await act(async () => { finish(response("old-launch", "old")); });
  expect(mockRouter.push.mock.calls).toEqual([["/order/latest"]]);
  expect(getOrder).not.toHaveBeenCalledWith("old");
  await hook.unmount();
});
