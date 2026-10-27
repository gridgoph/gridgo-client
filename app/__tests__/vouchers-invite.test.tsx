import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import VouchersScreen from "@/app/vouchers";
import { useCart } from "@/store/cart";
import { usePromotions } from "@/store/promotions";
import { useVouchers } from "@/store/vouchers";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { foundingVoucher, invite, promotions } from "@/test/promotionFixtures";

/** A Founder names one friend by email; the card then says where it stands. One press. */

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
  return { ...actual, listVouchers: jest.fn(), getPromotions: jest.fn(), inviteFriendPass: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

afterEach(async () => {
  await cleanup();
});

it("sends the friend's email and shows the invite as waiting for them", async () => {
  useVouchers.getState().reset();
  usePromotions.getState().reset();
  useCart.setState({ cartId: null, cart: null, hydrated: true });
  api.listVouchers.mockResolvedValue({ serverTime: new Date().toISOString(), vouchers: [foundingVoucher] });
  api.getPromotions.mockResolvedValue(
    promotions({ founding: { claimable: false, voucher: foundingVoucher }, friendPass: { canInvite: true } }),
  );
  const sent = invite();
  api.inviteFriendPass.mockResolvedValue(
    promotions({ founding: { claimable: false, voucher: foundingVoucher }, friendPass: { canInvite: false, invite: sent, invites: [sent] } }),
  );
  await renderInSafeArea(<VouchersScreen />);

  const field = await screen.findByLabelText("Your friend's email");
  fireEvent.changeText(field, " Ana@Example.com ");
  await waitFor(() => expect(screen.getByLabelText("Your friend's email").props.value).toBe(" Ana@Example.com "));
  fireEvent.press(screen.getByLabelText("Send invite"));

  expect(await screen.findByText("Invite sent. ana@example.com sees it when they sign in to GRIDGO.")).toBeTruthy();
  expect(api.inviteFriendPass).toHaveBeenCalledWith("ana@example.com");
  expect(
    screen.getByLabelText("Invited. Waiting for ana@example.com. They see it when they sign in to GRIDGO with that email."),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Your friend's email")).toBeNull();
});
