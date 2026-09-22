import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrderReceiptScreen from "@/app/order/receipt";

const mockDismissTo = jest.fn();
const mockStackOptions = jest.fn((_options: unknown) => null);

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismissTo: mockDismissTo,
  }),
  useLocalSearchParams: () => ({ orderId: "ord_1", from: "checkout" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  Stack: {
    Screen: ({ options }: { options: unknown }) => mockStackOptions(options) ?? null,
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

describe("receipt after checkout", () => {
  beforeEach(() => {
    mockDismissTo.mockReset();
    mockStackOptions.mockReset();
    api.getInvoice.mockResolvedValue({
      invoiceNumber: "GG-1",
      orderId: "ord_1",
      issuedAt: "2026-09-21T08:50:00.000Z",
      currency: "PHP",
      lines: [],
      itemSubtotalMinor: 6350,
      serviceFeeRateBps: 0,
      serviceFeeMinor: 0,
      deliveryLines: [],
      deliveryFeeMinor: 0,
      totalMinor: 6350,
      paymentPlan: { method: "qr_manual", downpaymentMinor: 4763, balanceMinor: 1587 },
    });
    api.getOrder.mockResolvedValue({
      id: "ord_1",
      state: "needs_qa",
      rated: false,
      payments: {},
    });
  });

  it("puts Orders on the header and leaves the request stack", async () => {
    await render(wrap(<OrderReceiptScreen />));
    await screen.findByText("Order receipt");

    expect(mockStackOptions).toHaveBeenCalled();
    const options = mockStackOptions.mock.calls.at(-1)?.[0] as {
      headerLeft?: () => ReactElement;
    };
    expect(typeof options.headerLeft).toBe("function");

    await render(wrap(options.headerLeft!()));
    await fireEvent.press(screen.getByLabelText("Back to orders"));
    expect(mockDismissTo).toHaveBeenCalledWith("/(tabs)/orders");
  });
});
