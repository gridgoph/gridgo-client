import { act, screen } from "@testing-library/react-native";

import { usePromotions } from "@/store/promotions";
import { renderClaimSheet, setUpClaimSheet } from "@/test/claimSheetHarness";
import { promotions } from "@/test/promotionFixtures";

/**
 * Operations changes the Founding 30 while the sheet is open (gridgo-api#315):
 * the title, the body, the ticket and the Redeem button all move to GRIDGO's
 * new answer together, so the tap never claims an amount the sheet did not say.
 */

jest.mock("expo-router", () => ({
  useSegments: () => ["(tabs)", "home"],
  router: { push: jest.fn() },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getPromotions: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("follows a refreshed amount and end date everywhere on the open sheet", async () => {
  setUpClaimSheet();
  api.getPromotions.mockResolvedValueOnce(promotions());
  await renderClaimSheet();
  await screen.findByText("Redeem ₱200 off");

  api.getPromotions.mockResolvedValueOnce(
    promotions({ founding: { amountMinor: 10000, endsAt: "2026-11-15T15:59:59.000Z" } }),
  );
  await act(() => usePromotions.getState().load());

  expect(await screen.findByText("Redeem ₱100 off")).toBeTruthy();
  expect(screen.getByText("₱100 off your first order")).toBeTruthy();
  expect(screen.getByText(/Use it by Sun, 15 Nov\./)).toBeTruthy();
  expect(screen.getByLabelText(/Founding 30: ₱100\.00 off your whole order, once\. Ends Sun, 15 Nov\./)).toBeTruthy();
  expect(screen.queryByText(/₱200/)).toBeNull();
  // The latch follows too, so a claim from here is remembered at ₱100.
  expect(usePromotions.getState().sheet?.amountMinor).toBe(10000);
});
