import { fireEvent, screen } from "@testing-library/react-native";

import RefundScreen from "@/app/order/refund";
import { refund, refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";
import { awaitingPaymentRecovery } from "@/test/shopChangeFixtures";

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

/* gridgo-api#225: refunds that come from a move to another shop. */
it("treats a cheaper shop's difference as a credit that needs only a receiving QR", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "supplier_assigned" }));
  api.listOrderRefunds.mockResolvedValue([
    refund({
      kind: "shop_move",
      status: "destination_review",
      destination: null,
      reason: "Replacement shop costs less; the price difference is returned.",
      history: [{ kind: "shop_move_credit_reserved", reason: "", at: "2026-09-28T10:00:00+08:00" }],
    }),
  ]);
  await renderScreen(<RefundScreen />);

  expect(await screen.findByText("Add your receiving QR")).toBeTruthy();
  expect(screen.getByText(/Your new shop costs less, so GRIDGO returns the difference\./)).toBeTruthy();
  expect(screen.getByText("Price-difference credit")).toBeTruthy();
  expect(screen.getByText(/^Shop changed /)).toBeTruthy();
});

// One press, so it is the last test in the file (AGENTS.md "Running and testing").
it("says withdrawing returns the client to paying the rest, not to a job carrying on", async () => {
  api.getOrder.mockResolvedValue(
    refundOrder({
      state: "supplier_assigned",
      shopRecovery: awaitingPaymentRecovery({ status: "refund_requested", refundRequestId: "refund_1" }),
    }),
  );
  api.listOrderRefunds.mockResolvedValue([refund()]);
  await renderScreen(<RefundScreen />);

  fireEvent.press(await screen.findByText("Withdraw request"));
  expect(await screen.findByText("Nothing is refunded, and you go back to paying the rest for the new shop.")).toBeTruthy();
});
