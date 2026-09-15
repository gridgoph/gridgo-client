import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import { invalidate } from "@/lib/live";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";

let mockFocused = true;
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual("react");
    const focused = mockFocused;
    useEffect(() => focused ? effect() : undefined, [effect, focused]);
  },
}));

it("reconciles missed events when focus returns", async () => {
  jest.useFakeTimers();
  Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
  const refresh = jest.fn();
  const hook = await renderHook(() => useLiveRefresh(["catalog"], refresh));
  await act(() => jest.advanceTimersByTimeAsync(80));
  expect(refresh).toHaveBeenCalledTimes(1);
  mockFocused = false;
  await hook.rerender({});
  invalidate("catalog");
  await act(() => jest.advanceTimersByTimeAsync(80));
  expect(refresh).toHaveBeenCalledTimes(1);
  mockFocused = true;
  await hook.rerender({});
  await act(() => jest.advanceTimersByTimeAsync(80));
  expect(refresh).toHaveBeenCalledTimes(2);
  await hook.unmount();
  jest.useRealTimers();
});

it("leaves focus loading to its caller while retaining live refreshes and cleanup", async () => {
  jest.useFakeTimers();
  mockFocused = true;
  Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
  const refresh = jest.fn();
  const cleanup = jest.fn();
  const hook = await renderHook(() => {
    useLiveRefresh(["orders"], refresh, { refreshOnFocus: false });
    useFocusEffect(useCallback(() => {
      refresh();
      return cleanup;
    }, []));
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(() => jest.advanceTimersByTimeAsync(80));
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => {
    invalidate("orders");
    await jest.advanceTimersByTimeAsync(80);
  });
  expect(refresh).toHaveBeenCalledTimes(2);
  mockFocused = false;
  await hook.rerender({});
  expect(cleanup).toHaveBeenCalledTimes(1);
  await act(async () => {
    invalidate("orders");
    await jest.advanceTimersByTimeAsync(80);
  });
  expect(refresh).toHaveBeenCalledTimes(2);
  mockFocused = true;
  await hook.rerender({});
  await act(() => jest.advanceTimersByTimeAsync(80));
  expect(refresh).toHaveBeenCalledTimes(3);
  await hook.unmount();
  expect(cleanup).toHaveBeenCalledTimes(2);
  jest.useRealTimers();
});
