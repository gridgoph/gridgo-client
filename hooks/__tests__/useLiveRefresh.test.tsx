import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import { invalidate } from "@/lib/live";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";

let mockFocused = true;
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => mockFocused ? effect() : undefined, [effect, mockFocused]);
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
