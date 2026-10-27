import { fireEvent, screen } from "@testing-library/react-native";

import { useVouchers } from "@/store/vouchers";
import { renderClaimSheet, setUpClaimSheet } from "@/test/claimSheetHarness";
import { foundingVoucher, promotions } from "@/test/promotionFixtures";

/**
 * Operations changes the Founding 30 between the sheet's last read and the
 * tap. GRIDGO issues the voucher at the new terms, so the "It's in your
 * wallet" ticket reads the issued voucher — never the offer it was showing.
 * One press, so its own file.
 */

jest.mock("expo-router", () => ({
  useSegments: () => ["(tabs)", "home"],
  router: { push: jest.fn() },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getPromotions: jest.fn(), claimFoundingVoucher: jest.fn(), listVouchers: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("shows the amount and end date GRIDGO issued, not the ones it offered", async () => {
  setUpClaimSheet();
  useVouchers.getState().reset();
  const issued = { ...foundingVoucher, valueMinor: 10000, expiresAt: "2026-11-15T15:59:59.000Z" };
  api.getPromotions.mockResolvedValue(promotions());
  api.claimFoundingVoucher.mockResolvedValue(
    promotions({ founding: { claimable: false, amountMinor: 10000, slotsLeft: 11, voucher: issued } }),
  );
  api.listVouchers.mockResolvedValue({ serverTime: new Date().toISOString(), vouchers: [issued] });
  await renderClaimSheet();

  await fireEvent.press(await screen.findByText("Redeem ₱200 off"));

  expect(await screen.findByText("It's in your wallet")).toBeTruthy();
  expect(screen.getByText("₱100.00 Founding 30 voucher added. GRIDGO takes it off your next order by itself.")).toBeTruthy();
  expect(screen.getByLabelText(/Founding 30: ₱100\.00 off your whole order, once\. Ends Sun, 15 Nov\./)).toBeTruthy();
  expect(screen.queryByText(/₱200/)).toBeNull();
  expect(screen.queryByText(/8 Nov/)).toBeNull();
});
