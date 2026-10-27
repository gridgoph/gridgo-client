import { screen } from "@testing-library/react-native";

import { renderClaimSheet, setUpClaimSheet } from "@/test/claimSheetHarness";
import { friendOffer, promotions } from "@/test/promotionFixtures";

/** A Friend Pass waiting for this client uses the same sheet, by its Founder's name. */

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

it("says who invited them, the amount and the whole-order rule", async () => {
  setUpClaimSheet();
  api.getPromotions.mockResolvedValue(promotions({ founding: { claimable: false, slotsLeft: 0 }, friendPass: { offer: friendOffer } }));
  await renderClaimSheet();

  expect(await screen.findByText("Ven invited you")).toBeTruthy();
  expect(screen.getByLabelText(/Friend Pass: ₱100\.00 off your whole order, once\. From Ven\. Ends Sun, 8 Nov\./)).toBeTruthy();
  expect(screen.getByText(/₱100 off your first order, from GRIDGO/)).toBeTruthy();
  expect(screen.getByText("Claim ₱100 off")).toBeTruthy();
});
