import { fireEvent, screen } from "@testing-library/react-native";

import { PayStep } from "@/components/express/PayStep";
import type * as api from "@/lib/api";
import { PERK_LINE } from "@/test/membershipFixtures";
import { choicesKey, defaultPrint } from "@/lib/express";
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

it("shows the perk and the uses left while the total is folded", async () => {
  seedPay({ shops: [printerCard()], supplierId: "shop_1" });
  readyDraft({ memberPerkMinor: 400, memberPerk: PERK_LINE, discountKind: "member_perk", totalMinor: 3_600, downpaymentMinor: 3_600 });
  await renderScreen(<PayStep />);
  expect(screen.getByTestId("express-perk")).toBeTruthy();
  expect(screen.getByText("Sample Guild member")).toBeTruthy();
  expect(screen.getByText("Member perk 3 of 5 this term, applied automatically. 2 left after this order.")).toBeTruthy();
});

it("says nothing about a perk GRIDGO did not give", async () => {
  seedPay({ shops: [printerCard()], supplierId: "shop_1" });
  readyDraft({ memberPerkMinor: 0, memberPerk: null });
  await renderScreen(<PayStep />);
  expect(screen.queryByTestId("express-perk")).toBeNull();
});

it("shows the perk by its label under the total, with the use it takes", async () => {
  seedPay({ shops: [printerCard()], supplierId: "shop_1" });
  readyDraft({ memberPerkMinor: 400, memberPerk: PERK_LINE, discountKind: "member_perk", totalMinor: 3_600, downpaymentMinor: 3_600 });
  await renderScreen(<PayStep />);
  fireEvent.press(screen.getByLabelText("Total: ₱36.00"));
  expect(await screen.findByText("Sample Guild member")).toBeTruthy();
  expect(screen.getByText("−₱4.00")).toBeTruthy();
  expect(screen.getByText("Member perk 3 of 5 this term, applied automatically. 2 left after this order.")).toBeTruthy();
  expect(screen.getByText("₱40.00")).toBeTruthy();
});
