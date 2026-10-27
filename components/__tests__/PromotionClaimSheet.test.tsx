import { screen, waitFor } from "@testing-library/react-native";

import { usePromotions } from "@/store/promotions";
import { usePushPrompt } from "@/store/pushPrompt";
import { renderClaimSheet, setUpClaimSheet } from "@/test/claimSheetHarness";
import { foundingVoucher, friendOffer, friendPassVoucher, promotions } from "@/test/promotionFixtures";

/**
 * When the Founding 30 / Friend Pass claim sheet opens (gridgo-api#315).
 * Every test before the last renders a sheet that stays shut: opening it is
 * a store write from an effect and spends this file's render budget (AGENTS.md,
 * "Running and testing"). Presses live in their own files.
 */

let mockSegments: string[] = ["(tabs)", "home"];
jest.mock("expo-router", () => ({
  useSegments: () => mockSegments,
  router: { push: jest.fn() },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getPromotions: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const TITLE = "₱200 off your first order";

async function renderWith(data: ReturnType<typeof promotions>, ready = true) {
  api.getPromotions.mockResolvedValue(data);
  await renderClaimSheet(ready);
  await waitFor(() => expect(api.getPromotions).toHaveBeenCalled());
}

beforeEach(() => {
  mockSegments = ["(tabs)", "home"];
  api.getPromotions.mockReset();
  setUpClaimSheet();
});

it("stays shut when every Founding slot is gone", async () => {
  await renderWith(promotions({ founding: { claimable: false, slotsLeft: 0 } }));
  await waitFor(() => expect(usePromotions.getState().data).not.toBeNull());
  expect(usePromotions.getState().sheet).toBeNull();
  expect(screen.queryByText(TITLE)).toBeNull();
});

it("stays shut for a client who already holds a Founding voucher or a Friend Pass", async () => {
  await renderWith(promotions({ founding: { claimable: false, voucher: foundingVoucher } }));
  await waitFor(() => expect(usePromotions.getState().data).not.toBeNull());
  expect(usePromotions.getState().sheet).toBeNull();

  usePromotions.getState().reset();
  api.getPromotions.mockResolvedValue(promotions({ founding: { claimable: false }, friendPass: { voucher: friendPassVoucher, offer: friendOffer } }));
  await usePromotions.getState().load();
  expect(usePromotions.getState().sheet).toBeNull();
});

it("waits for the launch intro", async () => {
  await renderWith(promotions(), false);
  await waitFor(() => expect(usePromotions.getState().data).not.toBeNull());
  expect(usePromotions.getState().sheet).toBeNull();
});

it("is never drawn over sign-in or complete profile", async () => {
  mockSegments = ["complete-profile"];
  await renderWith(promotions());
  await waitFor(() => expect(usePromotions.getState().data).not.toBeNull());
  expect(usePromotions.getState().sheet).toBeNull();
});

it("waits behind the notification explainer", async () => {
  usePushPrompt.setState({ open: true });
  await renderWith(promotions());
  await waitFor(() => expect(usePromotions.getState().data).not.toBeNull());
  expect(usePromotions.getState().sheet).toBeNull();
});

it("stays away for the rest of the session after Not now", async () => {
  usePromotions.setState({ dismissed: ["founding"] });
  await renderWith(promotions());
  await waitFor(() => expect(usePromotions.getState().data).not.toBeNull());
  expect(usePromotions.getState().sheet).toBeNull();
});

it("asks nothing of a signed-out phone", async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@/store/session").useSession.setState({ user: null });
  api.getPromotions.mockResolvedValue(promotions());
  await renderClaimSheet();
  expect(api.getPromotions).not.toHaveBeenCalled();
  expect(usePromotions.getState().sheet).toBeNull();
});

// Last: the sheet opens, which is a store write from an effect.
it("offers the Founding 30 with its amount, slots left, last day and the whole-order rule", async () => {
  await renderWith(promotions());

  expect(await screen.findByText(TITLE)).toBeTruthy();
  expect(screen.getByLabelText(/Founding 30: ₱200\.00 off your whole order, once\. Ends Sun, 8 Nov\. 12 left\./)).toBeTruthy();
  expect(screen.getByText(/It comes off your whole order, printing and delivery together, once/)).toBeTruthy();
  expect(screen.getByText("One launch discount per person: Founding 30 or Friend Pass, never both.")).toBeTruthy();
  expect(screen.getByText("Redeem ₱200 off")).toBeTruthy();
  expect(screen.getByText("Not now")).toBeTruthy();
});
