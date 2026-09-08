import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { useLiveNotifications } from "../useLiveNotifications";
import { useSession } from "@/store/session";
import { subscribeLive } from "@/lib/live";
import type { AlertStreamHandlers } from "@/lib/alertStream";
let mockHandlers: AlertStreamHandlers;
const mockClose = jest.fn();
const mockRefresh = jest.fn(async () => {});
jest.mock("@/lib/alertStream", () => ({
  openAlertStream: (handlers: AlertStreamHandlers) => {
    mockHandlers = handlers;
    return { close: mockClose, wake: jest.fn() };
  },
}));
jest.mock("@/store/notifications", () => ({
  useNotifications: {
    getState: () => ({ refresh: mockRefresh, setOwner: jest.fn() }),
  },
}));
it("reconciles missed identity/resources on reconnect and stops background delivery", async () => {
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    value: "active",
  });
  let lifecycle!: (state: AppStateStatus) => void;
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event, listener) => {
      lifecycle = listener;
      return { remove: jest.fn() };
    });
  const identity = jest.fn(async () => {});
  useSession.setState({
    user: { id: "client-a", role: "client" } as never,
    refresh: identity,
  });
  const listener = jest.fn();
  const unsub = subscribeLive(listener);
  const view = await renderHook(() => useLiveNotifications());
  await waitFor(() => expect(mockHandlers).toBeDefined());
  expect(identity).toHaveBeenCalled();
  listener.mockClear();
  identity.mockClear();
  await act(async () => {
    mockHandlers.onStatus?.(true);
  });
  expect(listener).toHaveBeenCalledWith("*");
  expect(identity).toHaveBeenCalledTimes(1);
  await act(async () => {
    lifecycle("background");
  });
  expect(mockClose).toHaveBeenCalled();
  const count = listener.mock.calls.length;
  await view.unmount();
  await act(async () => {
    mockHandlers.onInvalidate?.({ resource: "orders" });
  });
  expect(listener).toHaveBeenCalledTimes(count);
  unsub();
});
