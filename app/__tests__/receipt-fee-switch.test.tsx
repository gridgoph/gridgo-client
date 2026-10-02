import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrderReceiptScreen from "@/app/order/receipt";
import type { Invoice } from "@/lib/api";
import { expectNoServiceFee, setServiceFeeSwitch } from "@/test/serviceFeeSwitch";

/**
 * Operations' `serviceFeeVisibleToClient` switch, on both readings of the
 * receipt: the plain one from order detail and the printed slip from checkout.
 * The figures are the same either way — Printing ₱440 (fee inside) + Delivery
 * ₱25 = Total ₱465 — only the fee's name comes and goes.
 */

let mockParams: Record<string, string> = {};

jest.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  Stack: { Screen: () => null },
}));

jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: jest.fn(),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getInvoice: jest.fn(), getOrder: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const invoice: Invoice = {
  invoiceNumber: "GG-20261002-0001",
  orderId: "ord_fee_switch",
  issuedAt: "2026-10-02T01:05:00.000Z",
  currency: "PHP",
  lines: [
    {
      id: "line_1",
      jobId: "job_1",
      itemName: "Flyers",
      quantity: 100,
      unitPriceMinor: 400,
      amountMinor: 40000,
      artworkFileId: null,
      mockupFileId: null,
      dropoff: null,
    },
  ],
  itemSubtotalMinor: 40000,
  serviceFeeRateBps: 1000,
  serviceFeeMinor: 4000,
  deliveryLines: [],
  deliveryFeeMinor: 2500,
  totalMinor: 46500,
  paymentPlan: { method: "qr_manual", downpaymentMinor: 46500, balanceMinor: 0 },
};

const wrap = (node: ReactElement) => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }}
  >
    {node}
  </SafeAreaProvider>
);

beforeEach(() => {
  api.getInvoice.mockResolvedValue(invoice);
  api.getOrder.mockResolvedValue({
    id: "ord_fee_switch",
    state: "needs_qa",
    rated: false,
    payments: {
      initial: {
        amountMinor: 46500,
        method: "qr_manual",
        status: "pending_confirmation",
        reference: "1234567890123",
        submittedAt: "2026-10-02T01:05:00.000Z",
        confirmedAt: null,
      },
    },
  });
});

function expectSameMoney() {
  expect(screen.getAllByText("₱440.00").length).toBeGreaterThan(0);
  expect(screen.getByText("₱25.00")).toBeTruthy();
  expect(screen.getByText("₱465.00")).toBeTruthy();
  expect(screen.queryByText("₱400.00")).toBeNull();
  expect(screen.queryByText("₱40.00")).toBeNull();
}

it("shows no sign of a service fee on the receipt while Operations hides it", async () => {
  mockParams = { orderId: "ord_fee_switch" };
  setServiceFeeSwitch(false);
  await render(wrap(<OrderReceiptScreen />));

  expect(await screen.findByText("Order receipt")).toBeTruthy();
  expectSameMoney();
  expectNoServiceFee(screen);
});

it("shows no sign of a service fee on the printed slip while Operations hides it", async () => {
  mockParams = { orderId: "ord_fee_switch", from: "checkout" };
  setServiceFeeSwitch(false);
  await render(wrap(<OrderReceiptScreen />));

  expect(await screen.findByTestId("receipt-slip")).toBeTruthy();
  expectSameMoney();
  expectNoServiceFee(screen);
});

it("names the fee on the printed slip when Operations shows it", async () => {
  mockParams = { orderId: "ord_fee_switch", from: "checkout" };
  setServiceFeeSwitch(true);
  await render(wrap(<OrderReceiptScreen />));

  expect(await screen.findByTestId("receipt-slip")).toBeTruthy();
  expectSameMoney();
  expect(screen.getByText("Service fee · 10%")).toBeTruthy();
});
