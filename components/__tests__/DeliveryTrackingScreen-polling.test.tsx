import { act, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { DeliveryTrackingScreen } from "@/components/tracking/DeliveryTrackingScreen";
import * as api from "@/lib/api";

let mockFocused = true;
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual("react");
    const focused = mockFocused;
    useEffect(() => (focused ? effect() : undefined), [effect, focused]);
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
const mockRoute = jest.fn();
jest.mock("@/hooks/useRoute", () => ({ useRoute: (args: unknown) => mockRoute(args) ?? { route: null } }));
jest.mock("@/components/DeliveryMap", () => ({ DeliveryMap: (props: unknown) => mockMap(props) }));
jest.mock("@/lib/api", () => ({ getRiderTracking: jest.fn() }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const ORDER = {
  id: "order",
  state: "out_for_delivery",
  dropoff: { lat: 7.14, lng: 125.61, label: "Bajada, Davao City" },
  timeline: [],
} as unknown as api.Order;

function live(over: Partial<api.RiderTracking> = {}): api.RiderTracking {
  return {
    status: "live",
    refreshIntervalSeconds: 20,
    staleAfterSeconds: 120,
    lastUpdatedAt: new Date().toISOString(),
    ageSeconds: 3,
    stale: false,
    ...over,
  };
}

const ping: api.LocationPing = {
  id: "ping",
  orderId: "order",
  riderId: "rider",
  accuracy: null,
  lat: 7.13,
  lng: 125.61,
  at: new Date().toISOString(),
};

function screenFor(order: api.Order = ORDER, onOrderChanged?: () => void) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <DeliveryTrackingScreen order={order} onOrderChanged={onOrderChanged}>
        {null}
      </DeliveryTrackingScreen>
    </SafeAreaProvider>
  );
}

it.each([false, true])("ignores an overtaken answer or failure: %s", async (fails) => {
  let finish!: (value: Awaited<ReturnType<typeof api.getRiderTracking>>) => void;
  let fail!: (error: Error) => void;
  jest.mocked(api.getRiderTracking).mockReturnValueOnce(
    new Promise((resolve, reject) => {
      finish = resolve;
      fail = reject;
    }),
  );
  jest.mocked(api.getRiderTracking).mockResolvedValue({ ping, tracking: live() });
  const mounted = await render(screenFor());
  await act(async () => {
    await mockRefresh();
  });
  expect(mockMap.mock.lastCall?.[0]).toMatchObject({ rider: { lat: 7.13, lng: 125.61 } });
  await act(async () => {
    if (fails) fail(new Error("Old tracking failure"));
    else finish({ ping: { ...ping, lat: 7.1, lng: 125.6 }, tracking: live() });
  });
  expect(mockMap.mock.lastCall?.[0]).toMatchObject({ rider: { lat: 7.13, lng: 125.61 } });
  expect(screen.queryByText(/Could not check/)).toBeNull();
  await mounted.unmount();
});

it("polls at GRIDGO's interval and stops on blur and unmount", async () => {
  jest.useFakeTimers();
  mockFocused = true;
  jest.mocked(api.getRiderTracking).mockClear().mockResolvedValue({ ping: null, tracking: live({ status: "waiting", ageSeconds: null, refreshIntervalSeconds: 15 }) });
  const mounted = await render(screenFor());
  await act(() => jest.advanceTimersByTimeAsync(100));
  const afterFocus = jest.mocked(api.getRiderTracking).mock.calls.length;
  expect(afterFocus).toBeGreaterThanOrEqual(1);
  await act(() => jest.advanceTimersByTimeAsync(15_000));
  expect(jest.mocked(api.getRiderTracking).mock.calls.length).toBe(afterFocus + 1);
  mockFocused = false;
  await mounted.rerender(screenFor());
  const blurred = jest.mocked(api.getRiderTracking).mock.calls.length;
  await act(() => jest.advanceTimersByTimeAsync(60_000));
  expect(jest.mocked(api.getRiderTracking).mock.calls.length).toBe(blurred);
  mockFocused = true;
  await mounted.rerender(screenFor());
  await act(() => jest.advanceTimersByTimeAsync(100));
  expect(jest.mocked(api.getRiderTracking).mock.calls.length).toBe(blurred + 1);
  await mounted.unmount();
  await act(() => jest.advanceTimersByTimeAsync(60_000));
  expect(jest.mocked(api.getRiderTracking).mock.calls.length).toBe(blurred + 1);
  jest.useRealTimers();
});

it("removes the rider and the route, and re-reads the order, when the sharing window closes", async () => {
  mockFocused = true;
  mockRoute.mockImplementation(({ from, to }) => ({
    route: from && to ? { coordinates: [[from.lng, from.lat], [to.lng, to.lat]], routed: true, distanceMetres: 1000 } : null,
  }));
  jest.mocked(api.getRiderTracking).mockResolvedValue({ ping, tracking: live() });
  const onOrderChanged = jest.fn();
  const mounted = await render(screenFor(ORDER, onOrderChanged));
  expect(await screen.findByText("Live location")).toBeTruthy();
  expect(onOrderChanged).not.toHaveBeenCalled();
  expect(mockMap.mock.lastCall?.[0]).toMatchObject({ rider: { lat: 7.13, lng: 125.61 } });
  jest.mocked(api.getRiderTracking).mockResolvedValue({
    ping: null,
    tracking: live({ status: "inactive", ageSeconds: null, lastUpdatedAt: null }),
  });
  await act(async () => {
    await mockRefresh();
  });
  expect(mockMap.mock.lastCall?.[0]).toMatchObject({ rider: null, route: [] });
  expect(screen.getByText("Live location has ended")).toBeTruthy();
  // The delivery was recorded: the order itself has moved on.
  expect(onOrderChanged).toHaveBeenCalledTimes(1);
  await mounted.unmount();
});
