import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { DeliveryTrackingScreen } from "@/components/tracking/DeliveryTrackingScreen";
import type * as api from "@/lib/api";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => effect(), [effect]);
  },
}));
jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: () => undefined }));
jest.mock("@/hooks/useRoute", () => ({ useRoute: () => ({ route: null }) }));
jest.mock("@/components/DeliveryMap", () => ({ DeliveryMap: () => null }));
jest.mock("@/lib/api", () => ({ getRiderTracking: jest.fn(async () => ({ ping: null, tracking: null })) }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const open = { status: "open", closesAt: null, retentionHours: 24 } as const;

function order(deliveryChat: api.Order["deliveryChat"]): api.Order {
  return { id: "order_1", state: "out_for_delivery", deliveryChat, timeline: [] } as unknown as api.Order;
}

function screenFor(props: Partial<React.ComponentProps<typeof DeliveryTrackingScreen>> & { order: api.Order }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <DeliveryTrackingScreen {...props}>{null}</DeliveryTrackingScreen>
    </SafeAreaProvider>
  );
}

it("offers a call beside the message while the call window is open", async () => {
  await render(screenFor({ order: order(open), onOpenChat: jest.fn(), showCall: true }));
  expect(await screen.findByLabelText("Call your rider")).toBeTruthy();
  expect(screen.getByLabelText("Message your rider about this delivery")).toBeTruthy();
});

it("offers no call when the window is closed", async () => {
  await render(screenFor({ order: order(open), onOpenChat: jest.fn(), showCall: false }));
  expect(await screen.findByLabelText("Message your rider about this delivery")).toBeTruthy();
  expect(screen.queryByLabelText("Call your rider")).toBeNull();
});

it("offers neither once the conversation is read-only", async () => {
  await render(
    screenFor({
      order: order({ status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", retentionHours: 24 }),
      onOpenChat: jest.fn(),
      showCall: true,
    }),
  );
  expect(await screen.findByLabelText("Check for an update")).toBeTruthy();
  expect(screen.queryByLabelText("Message your rider about this delivery")).toBeNull();
  expect(screen.queryByLabelText("Call your rider")).toBeNull();
});

// The one press in this file, last.
it("opens the conversation with the rider", async () => {
  const onOpenChat = jest.fn();
  await render(screenFor({ order: order(open), onOpenChat }));
  fireEvent.press(await screen.findByLabelText("Message your rider about this delivery"));
  expect(onOpenChat).toHaveBeenCalledTimes(1);
});
