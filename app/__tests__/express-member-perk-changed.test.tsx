import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { EXPRESS_RIGHTS_SCOPE, PayFooter } from "@/components/express/PayStep";
import * as api from "@/lib/api";
import { PERK_LINE } from "@/test/membershipFixtures";
import { choicesKey, defaultPrint } from "@/lib/express";
import { agreeArtworkRights } from "@/test/legalGate";
import { expressChoices, useExpress } from "@/store/express";
import { renderScreen } from "@/test/renderScreen";
import { printerCard, WHO_PRINTS_FILE } from "@/test/whoPrintsFixtures";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listAddresses: jest.fn(async () => []),
  listExpressShops: jest.fn(async () => []),
  createExpressDraft: jest.fn(),
  getSettings: jest.fn(async () => ({})),
  getCart: jest.fn(),
  checkoutExpress: jest.fn(),
}));

function seedPay(overrides: Partial<ReturnType<typeof useExpress.getState>> = {}) {
  useExpress.getState().reset();
  useExpress.setState({
    step: "pay",
    files: [WHO_PRINTS_FILE],
    prints: [defaultPrint(WHO_PRINTS_FILE)],
    place: { lat: 7.07, lng: 125.61, label: "My location", addressId: null },
    fulfilment: "pickup",
    whoPrints: "off",
    shops: [],
    supplierId: null,
    ...overrides,
  });
}

function readyDraft(quote: Partial<api.ExpressQuote>) {
  const state = useExpress.getState();
  const key = choicesKey(expressChoices(state));
  const draft = {
    cartId: "cart_1",
    confirmation: "conf_1",
    shop: printerCard(),
    paymentTiming: "after_acceptance",
    quote: { clientItemSubtotalMinor: 4_000, deliveryFeeMinor: null, totalMinor: 4_000, downpaymentMinor: 4_000, ...quote },
  } as unknown as api.ExpressDraft;
  useExpress.setState({ draft: { status: "ready", key, draft } });
}

it("sends the perk on screen, and a perk that moved places nothing and shows the new total", async () => {
  seedPay({ shops: [printerCard()], supplierId: "shop_1" });
  readyDraft({ memberPerkMinor: 400, memberPerk: PERK_LINE, discountKind: "member_perk", totalMinor: 3_600, downpaymentMinor: 3_600 });
  useExpress.getState().setTicked(true);
  agreeArtworkRights(EXPRESS_RIGHTS_SCOPE);
  jest.mocked(api.checkoutExpress).mockRejectedValue(new api.ApiError(409, { error: "member_perk_changed", memberPerkMinor: 0 }));
  jest.mocked(api.getCart).mockResolvedValue({
    clientQuote: { clientItemSubtotalMinor: 4_000, totalMinor: 4_000, downpaymentMinor: 4_000, memberPerkMinor: 0, memberPerk: null },
  } as never);
  await renderScreen(<PayFooter />);
  fireEvent.press(screen.getByText("Place order · ₱36.00"));
  await waitFor(() => expect(api.checkoutExpress).toHaveBeenCalledWith("cart_1", expect.objectContaining({ expectedMemberPerkMinor: 400 })));
  expect(await screen.findByText(/can no longer be used on this order, so your total is ₱40\.00\. Your order was not placed/)).toBeTruthy();
  expect(screen.getByText("Place order · ₱40.00")).toBeTruthy();
});
