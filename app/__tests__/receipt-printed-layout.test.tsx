import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Dimensions } from "react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrderReceiptScreen from "@/app/order/receipt";
import type { Invoice } from "@/lib/api";
import { FILE_CHECK_AFTER_PAYMENT } from "@/lib/checkout";
import { holdPlacedReceipt, receiptFromCheckout } from "@/lib/receipt";

let mockReducedMotion = true;

jest.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockReducedMotion,
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ orderId: "ord_3ff0128e105a", from: "checkout" }),
  useNavigation: () => ({ addListener: () => () => undefined }),
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
  return {
    ...actual,
    getInvoice: jest.fn(),
    getOrder: jest.fn(),
    getSettings: jest.fn(async () => ({
      issueWindowHours: 24,
      serviceFeeRateBps: 1000,
      deliveryFeeBands: [],
    })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const invoice: Invoice = {
  invoiceNumber: "GG-20260927-0007",
  orderId: "ord_3ff0128e105a",
  issuedAt: "2026-09-27T01:05:00.000Z",
  currency: "PHP",
  lines: [
    {
      id: "line_1",
      jobId: "job_1",
      itemName: "Flyers",
      quantity: 100,
      unitPriceMinor: 4000,
      amountMinor: 40000,
      artworkFileId: "file_1",
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

/** The screen's own reads never answer, so what shows is checkout's handoff. */
beforeEach(() => {
  api.getInvoice.mockReturnValue(new Promise(() => undefined));
  api.getOrder.mockReturnValue(new Promise(() => undefined));
  holdPlacedReceipt(
    receiptFromCheckout(
      invoice,
      {
        id: "ord_3ff0128e105a",
        paymentPlan: {
          method: "qr_manual",
          downpaymentMinor: 46500,
          balanceMinor: 0,
          downpaymentStatus: "pending_confirmation",
          downpaymentPercent: 100,
        },
      },
      "1234567890123",
    ),
  );
});

// B2911823: the panel pinned under the slip covered it on a small phone.
describe("order placed layout", () => {
  it("pins a one-line thank-you with the actions and reads next steps under the slip", async () => {
    await render(wrap(<OrderReceiptScreen />));

    const footer = screen.getByTestId("receipt-footer");
    expect(within(footer).getByText("Thank you for ordering")).toBeTruthy();
    expect(within(footer).getByText("View order")).toBeTruthy();
    expect(within(footer).getByText("Back to Home")).toBeTruthy();
    // The next step is read under the slip, never pinned over it.
    expect(within(footer).queryByText(FILE_CHECK_AFTER_PAYMENT)).toBeNull();
    expect(within(screen.getByTestId("receipt-print")).getByText(FILE_CHECK_AFTER_PAYMENT)).toBeTruthy();
    // The slip's own payment line says where the payment stands; the thanks does not repeat it.
    expect(screen.queryByText(/GRIDGO checks your payment next/)).toBeNull();
  });

  // Fires an event, so it goes last in the file (see AGENTS.md, Running and testing).
  it("moves the thank-you under the slip when the panel would take too much of the screen", async () => {
    await render(wrap(<OrderReceiptScreen />));
    const { height } = Dimensions.get("window");

    await fireEvent(screen.getByTestId("receipt-footer"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: Math.ceil(height * 0.4) } },
    });

    expect(await within(screen.getByTestId("receipt-print")).findByText("Thank you for ordering")).toBeTruthy();
    expect(within(screen.getByTestId("receipt-footer")).queryByText("Thank you for ordering")).toBeNull();
    // The actions never leave the screen.
    expect(within(screen.getByTestId("receipt-footer")).getByText("View order")).toBeTruthy();
  });
});
