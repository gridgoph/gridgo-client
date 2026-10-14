import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { DeliveryTrackingScreen } from "@/components/tracking/DeliveryTrackingScreen";
import * as api from "@/lib/api";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => effect(), [effect]);
  },
}));
jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: () => undefined }));
jest.mock("@/hooks/useRoute", () => ({ useRoute: () => ({ route: null }) }));
const mockMap = jest.fn<null, [unknown]>(() => null);
jest.mock("@/components/DeliveryMap", () => ({ DeliveryMap: (props: unknown) => mockMap(props) }));
jest.mock("@/lib/api", () => ({ getRiderTracking: jest.fn() }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const MINUTE = 60_000;

const milestones = (reached: number): api.DeliveryMilestone[] =>
  [
    ["rider_assigned", "Rider assigned"],
    ["heading_to_shop", "Heading to the shop"],
    ["at_shop", "At the shop"],
    ["picked_up", "Picked up"],
    ["on_the_way", "On the way to you"],
    ["arrived", "Arrived"],
  ].map(([code, label], index) => ({
    code,
    label,
    status: index <= reached ? "completed" : "pending",
    at: index <= reached ? new Date(Date.now() - (10 - index) * MINUTE).toISOString() : null,
  }));

function order(state: string, reached: number): api.Order {
  return {
    id: "order_1",
    state,
    riderId: "rider",
    dropoff: { lat: 7.0731, lng: 125.6128, label: "Bajada, Davao City" },
    deliveryMilestones: milestones(reached),
    timeline: [],
  } as unknown as api.Order;
}

function tracking(over: Partial<api.RiderTracking>): api.RiderTracking {
  return {
    status: "live",
    refreshIntervalSeconds: 20,
    staleAfterSeconds: 120,
    lastUpdatedAt: null,
    ageSeconds: null,
    stale: false,
    ...over,
  };
}

async function show(o: api.Order) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <DeliveryTrackingScreen order={o}>{null}</DeliveryTrackingScreen>
    </SafeAreaProvider>,
  );
}

it("before pick-up shows the steps and why there is no rider on the map", async () => {
  jest.mocked(api.getRiderTracking).mockResolvedValue({ ping: null, tracking: tracking({ status: "inactive" }) });
  await show(order("rider_assigned", 1));
  expect(await screen.findByText("Live location starts at pick-up")).toBeTruthy();
  expect(screen.getAllByText("Heading to the shop").length).toBeGreaterThan(0);
  expect(screen.getByText("Next: At the shop")).toBeTruthy();
  expect(screen.getByLabelText("Delivery step 2 of 6: Heading to the shop")).toBeTruthy();
  expect(mockMap.mock.lastCall?.[0]).toMatchObject({ rider: null });
});

it("keeps the last known position, labelled, once it is out of date", async () => {
  const at = new Date(Date.now() - 4 * MINUTE).toISOString();
  jest.mocked(api.getRiderTracking).mockResolvedValue({
    ping: { id: "p", orderId: "order_1", riderId: "rider", lat: 7.09, lng: 125.61, accuracy: 8, at },
    tracking: tracking({ status: "stale", stale: true, ageSeconds: 240, lastUpdatedAt: at }),
  });
  await show(order("out_for_delivery", 4));
  expect(await screen.findByText("Rider location temporarily unavailable")).toBeTruthy();
  expect(screen.getByText("Last updated 4 minutes ago")).toBeTruthy();
  expect(mockMap.mock.lastCall?.[0]).toMatchObject({ rider: { lat: 7.09, lng: 125.61 }, stale: true });
});

it("says plainly when a read fails, and keeps the last answer", async () => {
  jest.mocked(api.getRiderTracking).mockRejectedValue(new Error("offline"));
  await show(order("out_for_delivery", 4));
  expect(await screen.findByText("Could not check just now. Showing the last update.")).toBeTruthy();
  expect(screen.getAllByText("On the way to you").length).toBeGreaterThan(0);
});
