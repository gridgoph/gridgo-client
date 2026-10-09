import { render, screen } from "@testing-library/react-native";
import { DeliveryTrackingCard } from "@/components/DeliveryTrackingCard";
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
jest.mock("@/lib/api", () => ({ getRiderLocation: jest.fn(async () => null) }));

const open = { status: "open", closesAt: null, retentionHours: 24 } as const;

function order(deliveryChat: api.Order["deliveryChat"]): api.Order {
  return { id: "order_1", state: "out_for_delivery", deliveryChat } as api.Order;
}

it("offers a call beside the message row while the call window is open", async () => {
  await render(<DeliveryTrackingCard order={order(open)} onOpenChat={jest.fn()} showCall />);
  expect(await screen.findByLabelText("Call your rider")).toBeTruthy();
  expect(screen.getByLabelText("Message your rider about this delivery")).toBeTruthy();
});

it("offers no call when the window is closed", async () => {
  await render(<DeliveryTrackingCard order={order(open)} onOpenChat={jest.fn()} showCall={false} />);
  expect(await screen.findByText("Message your rider")).toBeTruthy();
  expect(screen.queryByLabelText("Call your rider")).toBeNull();
});

it("offers no call once the delivery is done", async () => {
  await render(
    <DeliveryTrackingCard
      order={order({ status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", retentionHours: 24 })}
      onOpenChat={jest.fn()}
      showCall
    />,
  );
  expect(await screen.findByText("Check for an update")).toBeTruthy();
  expect(screen.queryByLabelText("Call your rider")).toBeNull();
});
