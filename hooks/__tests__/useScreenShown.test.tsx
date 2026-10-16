import { act, renderHook } from "@testing-library/react-native";

import { SCREEN_SHOWN_FALLBACK_MS, useScreenShown } from "@/hooks/useScreenShown";

type Listener = (event: { data?: { closing?: boolean } }) => void;

const mockListeners: Listener[] = [];
const mockUnsubscribe = jest.fn();

jest.mock("expo-router", () => ({
  useNavigation: () => mockNavigation,
}));

const mockNavigation = {
  addListener: (_type: string, listener: Listener) => {
    mockListeners.push(listener);
    return mockUnsubscribe;
  },
};

beforeEach(() => {
  jest.useFakeTimers();
  mockListeners.length = 0;
  mockUnsubscribe.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

/** The receipt's print waits on this, so it never plays under the push (#229). */
describe("useScreenShown", () => {
  it("turns true when the push finishes", async () => {
    const hook = await renderHook(() => useScreenShown());
    expect(hook.result.current).toBe(false);

    await act(async () => mockListeners.forEach((listener) => listener({ data: { closing: false } })));

    expect(hook.result.current).toBe(true);
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it("ignores the transition of the screen closing", async () => {
    const hook = await renderHook(() => useScreenShown());

    await act(async () => mockListeners.forEach((listener) => listener({ data: { closing: true } })));

    expect(hook.result.current).toBe(false);
  });

  it("never holds the moment behind an event that does not come", async () => {
    const hook = await renderHook(() => useScreenShown());

    await act(async () => {
      jest.advanceTimersByTime(SCREEN_SHOWN_FALLBACK_MS);
    });

    expect(hook.result.current).toBe(true);
  });
});
