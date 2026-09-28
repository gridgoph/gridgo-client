import { screen } from "@testing-library/react-native";

import RefundScreen from "@/app/order/refund";
import { renderScreen } from "@/test/renderScreen";
import { approvedRefund, refundOrder } from "@/test/refundFixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ orderId: "ord_refund_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getOrder: jest.fn(),
    listOrderRefunds: jest.fn(),
    getFile: jest.fn(async () => { throw new Error("offline"); }),
    getFileDownloadUrl: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("says an unknown transfer is being checked and will not be sent twice", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "cancelled", refundHold: true }));
  api.listOrderRefunds.mockResolvedValue([
    approvedRefund({
      status: "payment_unknown",
      history: [
        { kind: "settled", reason: "Agreed.", at: "2026-09-28T12:00:00+08:00" },
        { kind: "attempt", reason: "Ready to pay from ops-wallet-1.", at: "2026-09-28T13:00:00+08:00" },
        { kind: "unknown", reason: "Wallet timed out; debit is not yet known.", at: "2026-09-28T13:05:00+08:00" },
      ],
    }),
  ]);
  await renderScreen(<RefundScreen />);

  expect(await screen.findByText("Checking the transfer")).toBeTruthy();
  expect(screen.getByText(/never sent twice/)).toBeTruthy();
  expect(screen.getByText("Transfer result being checked")).toBeTruthy();
  // Operations' wallet working notes stay off the client's screen.
  expect(screen.queryByText(/ops-wallet-1/)).toBeNull();
  expect(screen.queryByText(/Wallet timed out/)).toBeNull();
  expect(screen.queryByText("Change receiving QR")).toBeNull();
  // A private image that will not load says so rather than drawing an empty frame.
  expect(await screen.findByText("This image did not load. Tap to try again.")).toBeTruthy();
});
