import { fireEvent, render, screen } from "@testing-library/react-native";

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
  gridgo-api#225, above the cover: a changed amount is shown again, never paid
  for the client. One press per file (AGENTS.md "Running and testing").
*/
it("shows the refreshed offer when the amount to pay changed", async () => {
  jest.mocked(api.acceptShopRecovery).mockRejectedValueOnce(
    new api.ApiError(409, { error: "shop_move_top_up_consent_required" }),
  );
  const onChanged = jest.fn();
  await render(<ShopRecoveryCard order={order} view={shopRecoveryView(order)!} onChanged={onChanged} />);
  fireEvent.press(screen.getByText("Pay ₱150.00 more and accept"));
  expect(await screen.findByText("Offer updated")).toBeTruthy();
  expect(screen.getByText(/The amount to pay has changed since the screen loaded/)).toBeTruthy();
  expect(onChanged).toHaveBeenCalled();
});
