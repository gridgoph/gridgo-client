import { act, render, screen } from "@testing-library/react-native";
import { DeliveryTrackingCard } from "@/components/DeliveryTrackingCard";
import * as api from "@/lib/api";

let mockRefresh: () => Promise<void>;
const mockMap = jest.fn<null, [unknown]>(() => null);
jest.mock("@/hooks/useLiveRefresh", () => ({
  useLiveRefresh: (_resources: unknown, refresh: () => Promise<void>) => { mockRefresh = refresh; },
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
