import { fireEvent, render, screen } from "@testing-library/react-native";
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

function order(deliveryChat: api.Order["deliveryChat"]): api.Order {
  return { id: "order_1", state: "out_for_delivery", deliveryChat } as api.Order;
}

it("offers no conversation when the order carries none", async () => {
  await render(<DeliveryTrackingCard order={order(undefined)} onOpenChat={jest.fn()} />);
  expect(await screen.findByText("Check for an update")).toBeTruthy();
  expect(screen.queryByText("Message your rider")).toBeNull();
});

it("leaves a delivered conversation to the order's help rows", async () => {
  await render(
    <DeliveryTrackingCard
      order={order({ status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", retentionHours: 24 })}
      onOpenChat={jest.fn()}
    />,
  );
  expect(await screen.findByText("Check for an update")).toBeTruthy();
  expect(screen.queryByText("Message your rider")).toBeNull();
});

// The one press in this file, last.
it("opens the conversation from the tracking card while the rider has the job", async () => {
  const onOpenChat = jest.fn();
  await render(
    <DeliveryTrackingCard order={order({ status: "open", closesAt: null, retentionHours: 24 })} onOpenChat={onOpenChat} />,
  );
  expect(await screen.findByText("Message your rider")).toBeTruthy();
  expect(screen.getByText(/phone number stays private/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Message your rider about this delivery"));
  expect(onOpenChat).toHaveBeenCalledTimes(1);
});
