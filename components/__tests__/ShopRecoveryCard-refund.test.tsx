import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ShopRecoveryCard } from "@/components/ShopRecoveryCard";
import * as api from "@/lib/api";
import { shopRecoveryView } from "@/lib/shopRecovery";
import { refundOrder } from "@/test/refundFixtures";
import { aboveCapWithAlternatives } from "@/test/shopChangeFixtures";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  acceptShopRecovery: jest.fn(async () => null),
  refundShopRecovery: jest.fn(async () => null),
  newIdempotencyKey: () => "key-1",
}));

const order = refundOrder({ state: "supplier_assigned", shopRecovery: aboveCapWithAlternatives() });

/*
  gridgo-api#225, above the cover: the refund asks first because it ends the
  order. Two presses, so this is the file's only test (AGENTS.md "Running and testing").
*/
it("cancels for a full refund after asking, and opens the refund", async () => {
  jest.mocked(api.refundShopRecovery).mockResolvedValueOnce({
    ...aboveCapWithAlternatives(),
    status: "refund_requested",
    refundRequestId: "refund_1",
  });
  await render(<ShopRecoveryCard order={order} view={shopRecoveryView(order)!} onChanged={jest.fn()} />);
  fireEvent.press(screen.getByText("Get a full refund instead"));
  expect(await screen.findByText("Cancel this order for a full refund?")).toBeTruthy();
  fireEvent.press(screen.getAllByText("Get a full refund").at(-1)!);
  await waitFor(() => expect(api.refundShopRecovery).toHaveBeenCalledWith("ord_refund_1", "shop_event_1", "key-1"));
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/order/refund", params: { orderId: "ord_refund_1", refundId: "refund_1" } }),
  );
});
