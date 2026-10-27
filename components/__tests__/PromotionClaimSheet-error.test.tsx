import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { ApiError } from "@/lib/api";
import { renderClaimSheet, setUpClaimSheet } from "@/test/claimSheetHarness";
import { promotions } from "@/test/promotionFixtures";

/**
 * A refused claim says why in words and reads the offer again; when that
 * read shows it has gone, the sheet offers nothing more to press. Every code's
 * wording is pinned in lib/__tests__/promotions.test.ts.
 */

jest.mock("expo-router", () => ({
  useSegments: () => ["(tabs)", "home"],
  router: { push: jest.fn() },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getPromotions: jest.fn(), claimFoundingVoucher: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("a sold-out claim is said plainly, the offer is read again, and only Close is left", async () => {
  setUpClaimSheet();
  api.getPromotions
    .mockResolvedValueOnce(promotions({ founding: { slotsLeft: 1 } }))
    .mockResolvedValue(promotions({ founding: { claimable: false, slotsLeft: 0 } }));
  api.claimFoundingVoucher.mockRejectedValue(new ApiError(409, { error: "promotion_sold_out" }));
  await renderClaimSheet();
  await screen.findByText("Redeem ₱200 off");

  fireEvent.press(screen.getByText("Redeem ₱200 off"));

  expect(await screen.findByText("Every Founding voucher has been claimed.")).toBeTruthy();
  await waitFor(() => expect(api.getPromotions).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("Close")).toBeTruthy();
  expect(screen.queryByText("Redeem ₱200 off")).toBeNull();
});
