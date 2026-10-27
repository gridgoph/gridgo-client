import { cleanup, screen } from "@testing-library/react-native";

import VouchersScreen from "@/app/vouchers";
import { useCart } from "@/store/cart";
import { usePromotions } from "@/store/promotions";
import { useVouchers } from "@/store/vouchers";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { foundingVoucher, invite, promotions } from "@/test/promotionFixtures";

/**
 * Account → Vouchers with the launch offers (gridgo-api#315): a Redeem card
 * while one is claimable, and a Founder's invite card with where it stands.
 * No presses here; the invite is sent in vouchers-invite.test.tsx.
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
  return { ...actual, listVouchers: jest.fn(), getPromotions: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  useVouchers.getState().reset();
  usePromotions.getState().reset();
  useCart.setState({ cartId: null, cart: null, hydrated: true });
  api.listVouchers.mockResolvedValue({ serverTime: new Date().toISOString(), vouchers: [] });
});

it("leads with a Redeem card while the Founding 30 is claimable", async () => {
  api.getPromotions.mockResolvedValue(promotions());
  await renderInSafeArea(<VouchersScreen />);

  expect(await screen.findByText("Redeem ₱200 off")).toBeTruthy();
  expect(screen.getByLabelText(/Founding 30: ₱200\.00 off your whole order, once\. Ends Sun, 8 Nov\. 12 left\./)).toBeTruthy();
  expect(screen.queryByText("Invite a friend")).toBeNull();
});

it("shows a Founder the friend they invited and where that pass stands", async () => {
  const sent = invite({ status: "claimed" });
  api.listVouchers.mockResolvedValue({ serverTime: new Date().toISOString(), vouchers: [foundingVoucher] });
  api.getPromotions.mockResolvedValue(
    promotions({ founding: { claimable: false, voucher: foundingVoucher }, friendPass: { invite: sent, invites: [sent] } }),
  );
  await renderInSafeArea(<VouchersScreen />);

  expect(await screen.findByText("Invite a friend")).toBeTruthy();
  expect(screen.getByLabelText("Claimed. ana@example.com claimed their Friend Pass.")).toBeTruthy();
  expect(screen.queryByLabelText("Your friend's email")).toBeNull();
  expect(screen.queryByText(/Redeem/)).toBeNull();
  // The claimed voucher sits in the wallet with its countdown.
  expect(await screen.findByText("Founding 30")).toBeTruthy();
});

it("tells a Founder whose friend already had a Founding voucher that they can name someone else", async () => {
  const skipped = invite({ status: "skipped_already_founder" });
  api.getPromotions.mockResolvedValue(
    promotions({
      founding: { claimable: false, voucher: foundingVoucher },
      friendPass: { canInvite: true, invite: skipped, invites: [skipped] },
    }),
  );
  await renderInSafeArea(<VouchersScreen />);

  expect(
    await screen.findByText(
      "ana@example.com already has a Founding voucher of their own, so your invite is free again. You can name someone else.",
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText("Your friend's email")).toBeTruthy();
});
