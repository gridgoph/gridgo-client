import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrderReceiptScreen from "@/app/order/receipt";
import type { Invoice, MatchedOrder } from "@/lib/api";
import { holdPlacedReceipt, receiptFromCheckout } from "@/lib/receipt";
import { useNotificationNudge } from "@/store/notificationNudge";

/**
 * The receipt's print moment and its sound (#229), on every route that issues
 * it: checkout, and the receipt-ready notice (inbox row or push). Order detail
 * opens the still reference copy, which never plays anything.
 *
 * Layout never fires under Jest, so each test lays the slip out by hand — that
 * is the cue the print waits on, with the screen's push already finished.
 * One event per test (see AGENTS.md, Running and testing).
 */

let mockReducedMotion = false;
let mockShown = true;
let mockParams: Record<string, string> = {};
const mockPlay = jest.fn();
const mockRelease = jest.fn();

jest.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockReducedMotion,
}));

jest.mock("@/hooks/useScreenShown", () => ({
  useScreenShown: () => mockShown,
}));

jest.mock("@/lib/appSound", () => ({
  loadAppSound: () => ({ play: mockPlay, release: mockRelease }),
}));

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

const ORDER_ID = "ord_3ff0128e105a";

const invoice: Invoice = {
  invoiceNumber: "GG-20260927-0007",
  orderId: ORDER_ID,
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

const order = {
  id: ORDER_ID,
  state: "needs_qa",
  paymentReference: "1234567890123",
  paymentPlan: {
    method: "qr_manual",
    downpaymentMinor: 46500,
    balanceMinor: 0,
    downpaymentStatus: "pending_confirmation",
    downpaymentPercent: 100,
  },
} as unknown as MatchedOrder;

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

/** One macrotask for Reanimated's mocked frame loop (see receipt-printed). */
async function animatedStylesLive() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

async function laySlipOut() {
  await fireEvent(screen.getByTestId("receipt-slip-feed"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 358, height: 640 } },
  });
}

beforeEach(() => {
  mockPlay.mockClear();
  mockRelease.mockClear();
  mockReducedMotion = false;
  mockShown = true;
  mockParams = { orderId: ORDER_ID, from: "checkout" };
  useNotificationNudge.setState({ muted: false, hushedUntil: 0 });
  // Checkout's handoff paints at once; the screen's own reads never answer.
  api.getInvoice.mockReturnValue(new Promise(() => undefined));
  api.getOrder.mockReturnValue(new Promise(() => undefined));
  holdPlacedReceipt(receiptFromCheckout(invoice, order, "1234567890123"));
});

describe("the receipt's print sound", () => {
  it("plays as the slip starts to print after checkout", async () => {
    await render(wrap(<OrderReceiptScreen />));
    await animatedStylesLive();
    expect(mockPlay).not.toHaveBeenCalled();

    await laySlipOut();

    expect(mockPlay).toHaveBeenCalledTimes(1);
    // The order's own notices land now: the bell swings but does not chime over it.
    expect(useNotificationNudge.getState().hushedUntil).toBeGreaterThan(Date.now());
    // The paper is on its way out of the slot, not parked above it.
    expect(screen.getByTestId("receipt-slip-feed")).not.toHaveAnimatedStyle({
      transform: [{ translateY: -4000 }],
    });
  });

  it("stays quiet when Settings > App sounds is off", async () => {
    useNotificationNudge.setState({ muted: true });
    await render(wrap(<OrderReceiptScreen />));

    await laySlipOut();

    expect(mockPlay).not.toHaveBeenCalled();
  });

  it("still plays for a phone that asks for reduced motion, over a still slip", async () => {
    mockReducedMotion = true;
    await render(wrap(<OrderReceiptScreen />));

    await laySlipOut();

    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("receipt-slip-feed")).toHaveAnimatedStyle({
      transform: [{ translateY: 0 }],
    });
  });

  it("waits for the screen to finish sliding in before it prints", async () => {
    mockShown = false;
    await render(wrap(<OrderReceiptScreen />));
    await animatedStylesLive();

    await laySlipOut();

    expect(mockPlay).not.toHaveBeenCalled();
    expect(screen.getByTestId("receipt-slip-feed")).toHaveAnimatedStyle({
      transform: [{ translateY: -4000 }],
    });
  });

  it("prints when the receipt-ready notice opens it, with its own way on", async () => {
    mockParams = { orderId: ORDER_ID, from: "notice" };
    holdPlacedReceipt(null);
    api.getInvoice.mockResolvedValue(invoice);
    api.getOrder.mockResolvedValue(order);
    await render(wrap(<OrderReceiptScreen />));
    await screen.findByText("Order summary");

    // The notice is not the moment of ordering: no thank-you, no Back to Home.
    expect(screen.queryByText("Thank you for ordering")).toBeNull();
    expect(screen.queryByText("Back to Home")).toBeNull();
    expect(screen.getByText("View order")).toBeTruthy();

    await laySlipOut();

    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it("never plays on the reference copy order detail opens", async () => {
    mockParams = { orderId: ORDER_ID };
    api.getInvoice.mockResolvedValue(invoice);
    api.getOrder.mockResolvedValue(order);
    await render(wrap(<OrderReceiptScreen />));
    await screen.findByText("Order receipt");

    expect(screen.queryByTestId("receipt-slip-feed")).toBeNull();
    expect(mockPlay).not.toHaveBeenCalled();
  });
});
