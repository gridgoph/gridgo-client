import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrderReceiptScreen from "@/app/order/receipt";
import { SERVICE_FEE_EXPLAINER } from "@/lib/serviceFee";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    dismissTo: jest.fn(),
  }),
  useLocalSearchParams: () => ({ orderId: "ord_3ff0128e105a" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  Stack: {
    Screen: () => null,
  },
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
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const frame = { x: 0, y: 0, width: 390, height: 844 };
const insets = { top: 0, left: 0, right: 0, bottom: 0 };
const wrap = (node: ReactElement) => (
  <SafeAreaProvider initialMetrics={{ frame, insets }}>{node}</SafeAreaProvider>
);

describe("order receipt", () => {
  beforeEach(() => {
    mockPush.mockReset();
    api.getInvoice.mockResolvedValue({
      invoiceNumber: "GG-20260824-0001",
      orderId: "ord_3ff0128e105a",
      issuedAt: "2026-08-24T01:00:00.000Z",
      currency: "PHP",
      lines: [
        {
          id: "line_1",
          jobId: "job_1",
          itemName: "Flyers",
          quantity: 100,
          unitPriceMinor: 4000,
          amountMinor: 4000,
          artworkFileId: null,
          mockupFileId: null,
          dropoff: null,
        },
      ],
      itemSubtotalMinor: 4000,
      serviceFeeRateBps: 1000,
      serviceFeeMinor: 400,
      deliveryLines: [],
      deliveryFeeMinor: 2500,
      totalMinor: 6900,
      paymentPlan: { method: "qr_manual", downpaymentMinor: 5175, balanceMinor: 1725 },
    });
    api.getOrder.mockResolvedValue({
      id: "ord_3ff0128e105a",
      state: "needs_qa",
      rated: false,
      payments: {
        initial: {
          amountMinor: 5175,
          method: "qr_manual",
          status: "pending_confirmation",
          reference: "1234567890123",
          submittedAt: "2026-08-24T01:00:00.000Z",
          confirmedAt: null,
        },
      },
    });
  });

  it("shows GRIDGO printing, delivery and total without adding the fee twice", async () => {
    await render(wrap(<OrderReceiptScreen />));

    expect(await screen.findByText("Order receipt")).toBeTruthy();
    expect(screen.getByText("GG-20260824-0001")).toBeTruthy();
    expect(screen.getByText("Printing")).toBeTruthy();
    expect(screen.getAllByText("₱44.00").length).toBeGreaterThan(0);
    expect(screen.queryByText("₱40.00")).toBeNull();
    expect(screen.getByText("Delivery")).toBeTruthy();
    expect(screen.getByText("₱25.00")).toBeTruthy();
    expect(screen.getByText("Service fee · 10%")).toBeTruthy();
    expect(screen.queryByText("₱4.00")).toBeNull();
    expect(screen.getByText("₱69.00")).toBeTruthy();
    expect(screen.getByText("1234567890123")).toBeTruthy();
    expect(screen.getByText("Request a physical invoice")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Service fee · 10%"));
    expect(screen.getByText(SERVICE_FEE_EXPLAINER)).toBeTruthy();
  });
});
