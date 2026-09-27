import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrderReceiptScreen from "@/app/order/receipt";
import type { Invoice } from "@/lib/api";
import { holdPlacedReceipt, receiptFromCheckout } from "@/lib/receipt";

let mockReducedMotion = true;

jest.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockReducedMotion,
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ orderId: "ord_3ff0128e105a", from: "checkout" }),
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

/**
 * Under Jest, Reanimated starts each `useAnimatedStyle` mapper on a
 * `setTimeout(0)` (react-native-worklets' mocked requestAnimationFrame), so for
 * one macrotask after mount a shared-value write never reaches the style.
 * Whether `render` and `fireEvent` happen to outlast that timer depends on how
 * loaded the runner is — CI on main failed on it — so wait for it outright.
 */
async function animatedStylesLive() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

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

describe("order placed receipt", () => {
  it("prints the order's real summary from checkout without waiting on a read", async () => {
    mockReducedMotion = true;
    await render(wrap(<OrderReceiptScreen />));

    expect(screen.getByText("Order summary")).toBeTruthy();
    expect(screen.getByText("#3FF0-128E-105A")).toBeTruthy();
    expect(screen.getByText("GG-20260927-0007")).toBeTruthy();
    expect(screen.getByText("Flyers")).toBeTruthy();
    expect(screen.getByText("Qty 100")).toBeTruthy();
    // Fee-inclusive printing, delivery, and Printing + Delivery = Total.
    expect(screen.getAllByText("₱440.00").length).toBe(2);
    expect(screen.getByText("₱25.00")).toBeTruthy();
    expect(screen.getByText("₱465.00")).toBeTruthy();
    expect(screen.queryByText("₱40.00")).toBeNull();
    expect(screen.getByText("Sent in full by QR. GRIDGO is checking it.")).toBeTruthy();
    expect(screen.getByText("1234567890123")).toBeTruthy();
    expect(screen.getByText(/not a BIR official receipt/)).toBeTruthy();
    expect(screen.queryByText(/^official receipt/i)).toBeNull();
    expect(screen.queryByText("Order receipt")).toBeNull();
    expect(screen.getByText("Thank you for ordering")).toBeTruthy();
    expect(screen.getByText("View order")).toBeTruthy();
    expect(screen.getByText("Back to Home")).toBeTruthy();
  });

  it("shows the slip already in place and the thank-you with reduce motion on", async () => {
    mockReducedMotion = true;
    await render(wrap(<OrderReceiptScreen />));

    expect(screen.getByTestId("receipt-slip-feed")).toHaveAnimatedStyle({
      transform: [{ translateY: 0 }],
    });
    expect(screen.getByTestId("receipt-thanks")).toHaveAnimatedStyle({
      opacity: 1,
      transform: [{ translateY: 0 }],
    });
  });

  it("holds the slip in the slot until it prints when motion is allowed", async () => {
    mockReducedMotion = false;
    await render(wrap(<OrderReceiptScreen />));

    expect(screen.getByTestId("receipt-slip-feed")).toHaveAnimatedStyle({
      transform: [{ translateY: -4000 }],
    });
    expect(screen.getByTestId("receipt-thanks")).toHaveAnimatedStyle({ opacity: 0 });
    // The actions never wait on the print.
    expect(screen.getByText("View order")).toBeTruthy();
  });

  // Interacts, so it goes last in the file (see AGENTS.md, Running and testing).
  it("finishes the print on any touch", async () => {
    mockReducedMotion = false;
    await render(wrap(<OrderReceiptScreen />));
    await animatedStylesLive();
    // Still held in the slot, so it is the touch that lands it.
    expect(screen.getByTestId("receipt-slip-feed")).toHaveAnimatedStyle({
      transform: [{ translateY: -4000 }],
    });

    await fireEvent(screen.getByTestId("receipt-print"), "touchStart");

    expect(screen.getByTestId("receipt-slip-feed")).toHaveAnimatedStyle({
      transform: [{ translateY: 0 }],
    });
    expect(screen.getByTestId("receipt-thanks")).toHaveAnimatedStyle({ opacity: 1 });
  });
});
