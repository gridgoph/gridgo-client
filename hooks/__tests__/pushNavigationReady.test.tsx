import { act, renderHook, waitFor } from "@testing-library/react-native";
import { usePushNotifications } from "../usePushNotifications";
import { useSession } from "@/store/session";
const mockRouter = { push: jest.fn() };
let mockSegments = ["(auth)", "login"];
const mockNative = {
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
  addNotificationReceivedListener: () => ({ remove: jest.fn() }),
  addPushTokenListener: () => ({ remove: jest.fn() }),
  getLastNotificationResponseAsync: async () => ({
    notification: {
      request: {
        identifier: "cold-tap",
        content: {
          data: {
            notificationId: "n1",
            type: "payment_confirmed",
            orderId: "order1",
          },
        },
      },
    },
  }),
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
