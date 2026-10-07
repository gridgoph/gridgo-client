import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrderReceiptScreen from "@/app/order/receipt";
import { TourOverlay } from "@/components/TourOverlay";
import type { Invoice, User } from "@/lib/api";
import { holdPlacedReceipt, receiptFromCheckout } from "@/lib/receipt";
import { TOUR_LENGTH } from "@/lib/tour";
import { useSession } from "@/store/session";
import { useTour } from "@/store/tour";

/**
 * The tour's last step is on checkout, and placing the order is what leaves
 * checkout for the order-placed receipt. The card must go with checkout: a
 * dim left over the receipt would swallow the touch that finishes the print.
 * One interaction per file — see AGENTS.md on this renderer.
 */

jest.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
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

const CHECKOUT_CARD = "Pay and place your order";
/** Past the overlay's wait for a pushed screen to settle. */
const PAST_SETTLE_MS = 600;

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

const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

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
  useSession.setState({
    user: { id: "usr_a", email: "a@example.com", name: "Ana", role: "client" } as User,
  });
  useTour.getState().reset();
  useTour.setState({
    hydrated: true,
    progress: { usr_a: { status: "active", step: TOUR_LENGTH - 1 } },
  });
});

it("drops the checkout card once the order is placed, and never blocks the print", async () => {
  // Checkout is up with the tour on its last step.
  const checkoutFocus = useTour.getState().arrive("usr_a", "checkout");
  await render(
    wrap(
      <>
        <OrderReceiptScreen />
        <TourOverlay ready />
      </>,
    ),
  );
  expect(await screen.findByText(CHECKOUT_CARD)).toBeTruthy();

  // Placing the order dismisses checkout, and its blur hands the screen back.
  await act(() => useTour.getState().leave(checkoutFocus));
  await wait(PAST_SETTLE_MS);

  expect(screen.queryByText(CHECKOUT_CARD)).toBeNull();
  expect(screen.queryByLabelText("Skip the tour")).toBeNull();

  expect(screen.getByTestId("receipt-slip-feed")).toHaveAnimatedStyle({
    transform: [{ translateY: -4000 }],
  });
  await fireEvent(screen.getByTestId("receipt-print"), "touchStart");
  expect(screen.getByTestId("receipt-slip-feed")).toHaveAnimatedStyle({
    transform: [{ translateY: 0 }],
  });
  expect(screen.getByTestId("receipt-thanks")).toHaveAnimatedStyle({ opacity: 1 });
});
