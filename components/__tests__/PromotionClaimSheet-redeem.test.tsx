import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { useVouchers } from "@/store/vouchers";
import { renderClaimSheet, setUpClaimSheet } from "@/test/claimSheetHarness";
import { foundingVoucher, promotions } from "@/test/promotionFixtures";

/** Redeem claims the Founding 30, and the sheet says where it went. */

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useSegments: () => ["(tabs)", "home"],
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getPromotions: jest.fn(), claimFoundingVoucher: jest.fn(), listVouchers: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("claims it, reads the wallet again and says it is there", async () => {
  setUpClaimSheet();
  useVouchers.getState().reset();
  api.getPromotions.mockResolvedValue(promotions());
  api.claimFoundingVoucher.mockResolvedValue(
    promotions({ founding: { claimable: false, slotsLeft: 11, voucher: foundingVoucher }, friendPass: { canInvite: true } }),
  );
  api.listVouchers.mockResolvedValue({ serverTime: new Date().toISOString(), vouchers: [foundingVoucher] });
  await renderClaimSheet();
  await screen.findByText("Redeem ₱200 off");

  fireEvent.press(screen.getByText("Redeem ₱200 off"));

  expect(await screen.findByText("It's in your wallet")).toBeTruthy();
  expect(api.claimFoundingVoucher).toHaveBeenCalledTimes(1);
  expect(screen.getByText("₱200.00 Founding 30 voucher added. GRIDGO takes it off your next order by itself.")).toBeTruthy();
  expect(screen.getByText("See my vouchers")).toBeTruthy();
  await waitFor(() => expect(api.listVouchers).toHaveBeenCalled());
});
