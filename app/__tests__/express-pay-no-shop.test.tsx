import { screen } from "@testing-library/react-native";

import { PayFooter, PayStep } from "@/components/express/PayStep";
import type * as api from "@/lib/api";
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
}));

// 9BA29059: "No open Express shop nearby" still opened a ₱0.00 pay sheet with
// an empty QR. No presses in this file but the last test.

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
    paymentTiming: "checkout",
    quote: { clientItemSubtotalMinor: 4_000, deliveryFeeMinor: null, totalMinor: 4_000, downpaymentMinor: 4_000, ...quote },
  } as unknown as api.ExpressDraft;
  useExpress.setState({ draft: { status: "ready", key, draft } });
}

const body = () => (
  <>
    <PayStep />
    <PayFooter />
  </>
);

it("with no open shop for pick-up, says why and what next, and keeps payment shut", async () => {
  seedPay();
  await renderScreen(body());
  expect(screen.getByText("No open Express shop nearby")).toBeTruthy();
  expect(screen.getByLabelText(/Choose Deliver, or try again later\. Try again$/)).toBeTruthy();
  // The payment row reads Not yet and cannot open a sheet.
  expect(screen.queryByLabelText(/^Pay with: QR Ph/)).toBeNull();
  expect(screen.queryByText("QR Ph · add receipt")).toBeNull();
  expect(screen.queryByText("Show the QR to scan")).toBeNull();
  expect(screen.queryByText(/₱0\.00/)).toBeNull();
  expect(screen.getByText("Place order opens once a shop can take it.")).toBeTruthy();
  expect(screen.getByLabelText("Total: Not priced")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Place order" }).props.accessibilityState).toMatchObject({ disabled: true });
});

it("with no shop that delivers, offers another place or later", async () => {
  seedPay({ fulfilment: "delivery", place: { lat: 7.07, lng: 125.61, label: "Home", addressId: "addr_1" } });
  await renderScreen(body());
  expect(screen.getByText("No Express shop can deliver here right now. Choose another place, or try again later.")).toBeTruthy();
  expect(screen.queryByText(/₱0\.00/)).toBeNull();
});

it("a ready draft with no amount never asks for ₱0.00", async () => {
  seedPay({ shops: [printerCard()], supplierId: "shop_1" });
  readyDraft({ totalMinor: null, downpaymentMinor: 0 });
  await renderScreen(body());
  expect(screen.queryByText("QR Ph · add receipt")).toBeNull();
  expect(screen.getByText("GRIDGO has no price for this yet. Try again in a moment.")).toBeTruthy();
  expect(screen.queryByText(/₱0\.00/)).toBeNull();
  expect(screen.getByRole("button", { name: "Place order" }).props.accessibilityState).toMatchObject({ disabled: true });
});

it("with a shop and a quote, the payment row opens as before", async () => {
  seedPay({ shops: [printerCard()], supplierId: "shop_1" });
  readyDraft({});
  await renderScreen(body());
  expect(screen.getByLabelText("Pay with: QR Ph · add receipt")).toBeTruthy();
  expect(screen.getByText("Place order · ₱40.00")).toBeTruthy();
  expect(screen.queryByText("No open Express shop nearby")).toBeNull();
});

// Presses go last in this file.
it("Try again reads the shops again for the chosen way of getting it", async () => {
  const { fireEvent } = jest.requireActual<typeof import("@testing-library/react-native")>("@testing-library/react-native");
  const apiMock = jest.requireMock<typeof import("@/lib/api")>("@/lib/api");
  seedPay();
  await renderScreen(body());
  fireEvent.press(screen.getByLabelText(/Try again$/));
  expect(apiMock.listExpressShops).toHaveBeenCalledWith({ lat: 7.07, lng: 125.61, label: "My location", addressId: null }, "nearest", "pickup");
});
