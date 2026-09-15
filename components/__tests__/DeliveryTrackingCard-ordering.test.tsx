import { act, render, screen } from "@testing-library/react-native";
import { DeliveryTrackingCard } from "@/components/DeliveryTrackingCard";
import * as api from "@/lib/api";

let mockFocused = true;
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual("react");
    const focused = mockFocused;
    useEffect(() => focused ? effect() : undefined, [effect, focused]);
  },
}));

let mockRefresh: () => Promise<void>;
const mockMap = jest.fn<null, [unknown]>(() => null);
jest.mock("@/hooks/useLiveRefresh", () => ({
  useLiveRefresh: (resources: unknown, refresh: () => Promise<void>, options: unknown) => {
    mockRefresh = refresh;
    jest.requireActual("@/hooks/useLiveRefresh").useLiveRefresh(resources, refresh, options);
  },
}));
jest.mock("@/hooks/useRoute", () => ({ useRoute: () => ({ route: null }) }));
jest.mock("@/components/DeliveryMap", () => ({
  DeliveryMap: (props: unknown) => mockMap(props),
}));
jest.mock("@/lib/api", () => ({ getRiderLocation: jest.fn() }));

it.each([false, true])("ignores a stale tracking response or failure: %s", async (fails) => {
  let finish!: (ping: api.LocationPing) => void;
  let fail!: (error: Error) => void;
  jest.mocked(api.getRiderLocation).mockReturnValueOnce(new Promise((resolve, reject) => {
    finish = resolve;
    fail = reject;
  }));
  const newest: api.LocationPing = { id: "ping", orderId: "order", riderId: "rider", accuracy: null, lat: 7.13, lng: 125.61, at: new Date().toISOString() };
  jest.mocked(api.getRiderLocation).mockResolvedValue(newest);
  const mounted = await render(<DeliveryTrackingCard order={{ id: "order", state: "out_for_delivery" } as api.Order} />);
  await act(async () => { await mockRefresh(); });
  expect(mockMap.mock.lastCall?.[0]).toMatchObject({ rider: { lat: 7.13, lng: 125.61 } });
  await act(async () => {
    if (fails) fail(new Error("Old tracking failure"));
    else finish({ ...newest, lat: 7.1, lng: 125.6, at: "2026-01-01T00:00:00Z" });
  });
  expect(mockMap.mock.lastCall?.[0]).toMatchObject({ rider: { lat: 7.13, lng: 125.61 } });
  expect(screen.queryByText("Could not check")).toBeNull();
  await mounted.unmount();
});

it("loads once on focus, polls, and stops polling on blur and unmount", async () => {
  jest.useFakeTimers();
  mockFocused = true;
  jest.mocked(api.getRiderLocation).mockClear().mockResolvedValue(null);
  const card = <DeliveryTrackingCard order={{ id: "order", state: "out_for_delivery" } as api.Order} />;
  const mounted = await render(card);
  await act(() => jest.advanceTimersByTimeAsync(80));
  expect(api.getRiderLocation).toHaveBeenCalledTimes(1);
  await act(() => jest.advanceTimersByTimeAsync(30_000));
  expect(api.getRiderLocation).toHaveBeenCalledTimes(2);
  mockFocused = false;
  await mounted.rerender(<DeliveryTrackingCard order={{ id: "order", state: "out_for_delivery" } as api.Order} />);
  await act(() => jest.advanceTimersByTimeAsync(30_000));
  expect(api.getRiderLocation).toHaveBeenCalledTimes(2);
  mockFocused = true;
  await mounted.rerender(<DeliveryTrackingCard order={{ id: "order", state: "out_for_delivery" } as api.Order} />);
  await act(() => jest.advanceTimersByTimeAsync(80));
  expect(api.getRiderLocation).toHaveBeenCalledTimes(3);
  await mounted.unmount();
  await act(() => jest.advanceTimersByTimeAsync(30_000));
  expect(api.getRiderLocation).toHaveBeenCalledTimes(3);
  jest.useRealTimers();
});
