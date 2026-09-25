import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import { usePushNotifications } from "../usePushNotifications";
import { useSession } from "@/store/session";

/**
 * Registration is not something a person has to find. A granted phone
 * registers at launch (unclaimed if nobody is signed in), again the moment
 * someone signs in so the token is claimed, and again on every return to the
 * foreground — which is also how a phone sent to its settings comes back
 * registered.
 */

const mockRegisterIfGranted = jest.fn(async () => {});
const mockResume = jest.fn(async () => {});

jest.mock("@/lib/api", () => ({ getOrder: jest.fn(), onUnauthorized: jest.fn() }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useRootNavigationState: () => ({ key: "root" }),
  useSegments: () => ["(tabs)", "home"],
}));
jest.mock("@/store/push", () => ({
  getNotificationsNative: () => null,
  pushSupported: () => true,
  usePush: {
    getState: () => ({
      registerIfGranted: mockRegisterIfGranted,
      resume: mockResume,
    }),
  },
}));

let foreground: ((state: AppStateStatus) => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  foreground = undefined;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    foreground = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as never;
  });
  useSession.setState({ user: null });
});

it("registers at launch, and again when someone signs in to claim the token", async () => {
  const hook = await renderHook(() => usePushNotifications());
  expect(mockRegisterIfGranted).toHaveBeenCalledTimes(1);

  await act(async () => {
    useSession.setState({ user: { id: "client", role: "client" } as never });
  });

  expect(mockRegisterIfGranted).toHaveBeenCalledTimes(2);
  await hook.unmount();
});

it("re-checks permission and registers on every return to the foreground", async () => {
  const hook = await renderHook(() => usePushNotifications());
  expect(foreground).toBeDefined();

  await act(async () => foreground?.("background"));
  expect(mockResume).not.toHaveBeenCalled();

  await act(async () => foreground?.("active"));
  expect(mockResume).toHaveBeenCalledTimes(1);
  await hook.unmount();
});
