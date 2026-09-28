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
    getFile: jest.fn(async (fileId: string) => ({ fileId, detectedContentType: "image/png", purpose: "refund_receipt" })),
    getFileDownloadUrl: jest.fn(async (fileId: string) => ({ fileId, url: `https://files.test/${fileId}`, expiresAt: "", expiresInSeconds: 60 })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("shows a paid refund with its transfer evidence, never as an official receipt", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "cancelled", refundDisposition: "cancelled" }));
  api.listOrderRefunds.mockResolvedValue([
    approvedRefund({
      status: "paid",
      version: 6,
      payment: {
        id: "rpay_1",
        reference: "WALLET-123",
        receiptFileId: "file_refund_receipt",
        amountMinor: 71000,
        paidAt: "2026-09-28T14:30:00+08:00",
        evidenceLabel: "Wallet transfer evidence",
      },
    }),
  ]);
  await renderScreen(<RefundScreen />);

  expect(await screen.findByText("Refunded")).toBeTruthy();
  expect(screen.getByText("₱710.00 was sent to your GCash account")).toBeTruthy();
  expect(screen.getByLabelText("Refund stage 4 of 4: Sent")).toBeTruthy();
  expect(screen.getByText("Wallet transfer evidence")).toBeTruthy();
  expect(screen.getByText("WALLET-123")).toBeTruthy();
  expect(screen.getByText(/not an official receipt/)).toBeTruthy();
  // A finished transfer locks the destination.
  expect(screen.queryByText("Change receiving QR")).toBeNull();
});
