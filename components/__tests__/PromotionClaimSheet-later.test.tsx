import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import { usePromotions } from "@/store/promotions";
import { useSession } from "@/store/session";
import { renderClaimSheet, setUpClaimSheet } from "@/test/claimSheetHarness";
import { promotions } from "@/test/promotionFixtures";

/** "Not now" takes no slot, and the sheet comes back on the next sign-in. */

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

it("Not now closes it without claiming, and the next sign-in offers it again", async () => {
  setUpClaimSheet();
  api.getPromotions.mockResolvedValue(promotions());
  await renderClaimSheet();
  await screen.findByText("₱200 off your first order");

  fireEvent.press(screen.getByText("Not now"));
  await waitFor(() => expect(usePromotions.getState().sheet).toBeNull());
  expect(usePromotions.getState().dismissed).toEqual(["founding"]);
  expect(api.claimFoundingVoucher).not.toHaveBeenCalled();

  // Signed out, then the same client signs in again: slots still remain.
  await act(async () => useSession.setState({ user: null }));
  await act(async () => useSession.setState({ user: { id: "u1", email: "ana@example.com", name: "Ana", role: "client" } } as never));
  await waitFor(() => expect(usePromotions.getState().sheet?.kind).toBe("founding"));
  expect(usePromotions.getState().dismissed).toEqual([]);
});
