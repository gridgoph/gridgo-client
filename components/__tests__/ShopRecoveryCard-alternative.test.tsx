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
it("picks another offered shop by its option, consenting to its own top-up", async () => {
  await render(<ShopRecoveryCard order={order} view={shopRecoveryView(order)!} onChanged={jest.fn()} />);
  fireEvent.press(screen.getAllByText(/^Pick the shop ready /)[1]);
  await waitFor(() =>
    expect(api.acceptShopRecovery).toHaveBeenCalledWith("ord_refund_1", "shop_event_1", {
      optionId: "option_3",
      acceptTopUpMinor: 5000,
    }),
  );
});
