import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import VouchersScreen from "@/app/vouchers";
import { useCart } from "@/store/cart";
import { usePromotions } from "@/store/promotions";
import { useVouchers } from "@/store/vouchers";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { promotions } from "@/test/promotionFixtures";

/**
 * Redeem on Account → Vouchers loses the race for the last slot. The refusal
 * reads the offers again, the Founding 30 is gone, and the Redeem card with
 * it — the reason why must stay on screen. One press, so its own file.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, listVouchers: jest.fn(), getPromotions: jest.fn(), claimFoundingVoucher: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("keeps the sold-out reason after the refreshed offers take the Redeem card away", async () => {
  useVouchers.getState().reset();
  usePromotions.getState().reset();
  useCart.setState({ cartId: null, cart: null, hydrated: true });
  api.listVouchers.mockResolvedValue({ serverTime: new Date().toISOString(), vouchers: [] });
  api.getPromotions
    .mockResolvedValueOnce(promotions())
    .mockResolvedValue(promotions({ founding: { claimable: false, slotsLeft: 0 } }));
  api.claimFoundingVoucher.mockRejectedValue(new api.ApiError(409, { error: "promotion_sold_out" }));

  await renderInSafeArea(<VouchersScreen />);
  await fireEvent.press(await screen.findByText("Redeem ₱200 off"));

  expect(await screen.findByText("Every Founding voucher has been claimed.")).toBeTruthy();
  // The refresh landed: the offer and its card are gone, the reason is not.
  await waitFor(() => expect(screen.queryByTestId("redeem-offer")).toBeNull());
  expect(screen.getByText("Every Founding voucher has been claimed.")).toBeTruthy();
});
