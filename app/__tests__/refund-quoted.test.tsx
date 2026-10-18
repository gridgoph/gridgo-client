import { screen } from "@testing-library/react-native";

import RefundScreen from "@/app/order/refund";
import { cancellationQuote } from "@/test/cancellationQuote";
import { renderScreen } from "@/test/renderScreen";
import { refund, refundOrder } from "@/test/refundFixtures";

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
    getFile: jest.fn(async (fileId: string) => ({ fileId, detectedContentType: "image/png", purpose: "refund_qr" })),
    getFileDownloadUrl: jest.fn(async (fileId: string) => ({ fileId, url: `https://files.test/${fileId}`, expiresAt: "", expiresInSeconds: 60 })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("shows the amount the client confirmed while Operations settles the cancellation", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ refundHold: true }));
  api.listOrderRefunds.mockResolvedValue([refund({ cancellationQuote: cancellationQuote() })]);
  await renderScreen(<RefundScreen />);

  expect(await screen.findByText("WHAT COMES BACK")).toBeTruthy();
  expect(screen.getByText("₱710.00")).toBeTruthy();
  expect(screen.getByText(/The amount you confirmed when you cancelled/)).toBeTruthy();
  // Confirmed is not approved, and approved is not sent.
  expect(screen.queryByText("Refunded")).toBeNull();
  expect(screen.queryByText(/approved — not sent yet/)).toBeNull();
});
