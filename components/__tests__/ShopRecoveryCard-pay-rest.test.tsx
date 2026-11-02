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

/* gridgo-api#225, above the cover: one press per file (AGENTS.md "Running and testing"). */
it("pays the rest with consent to exactly the amount shown, then reloads", async () => {
  const onChanged = jest.fn();
  await render(<ShopRecoveryCard order={order} view={shopRecoveryView(order)!} onChanged={onChanged} />);
  fireEvent.press(screen.getByText("Pay ₱150.00 more and accept"));
  await waitFor(() =>
    expect(api.acceptShopRecovery).toHaveBeenCalledWith("ord_refund_1", "shop_event_1", { acceptTopUpMinor: 15000 }),
  );
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});
