import * as api from "@/lib/api";
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

it.each(["catalog", "reconnect"])("clears the product tree before %s refresh listeners run", async (event) => {
  Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
  useSession.setState({ user: { id: "client-a", role: "client" } as never, refresh: jest.fn(async () => {}) });
  api.setToken(null);
  api.setTokenProvider(null);
  const view = await renderHook(() => useLiveNotifications());
  const payload = (name: string) => ({ ok: true, status: 200, text: async () => JSON.stringify({
    productCategories: [{ code: "print", name, subcategories: [{ code: "flyers", name: "Flyers" }] }],
  }) } as Response);
  const fetch = jest.spyOn(global, "fetch").mockResolvedValue(payload("Old"));
  await api.getProductCategories();
  fetch.mockResolvedValue(payload("New"));
  let tree!: ReturnType<typeof api.getProductCategories>;
  const stop = subscribeLive(() => { tree = api.getProductCategories(); });
  await act(async () => {
    if (event === "catalog") mockHandlers.onInvalidate?.({ resource: "catalog" });
    else mockHandlers.onStatus?.(true);
    await tree;
  });
  expect((await tree)[0].name).toBe("New");
  expect(fetch).toHaveBeenCalledTimes(2);
  stop();
  await view.unmount();
  fetch.mockRestore();
});
