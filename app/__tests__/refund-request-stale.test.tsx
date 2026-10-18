import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import RefundRequestScreen from "@/app/order/refund-request";
import { ApiError } from "@/lib/api";
import { useRefundDraft } from "@/store/refundDraft";
import { cancellationQuote } from "@/test/cancellationQuote";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ orderId: "ord_refund_1" }),
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getOrder: jest.fn(),
    listOrderRefunds: jest.fn(),
    requestRefund: jest.fn(),
    getCancellationQuote: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

// Two presses spend the file (see AGENTS.md), so this is its only test.
it("shows the new amount and asks again when the quote went stale, never sending it silently", async () => {
  api.getOrder.mockResolvedValue(refundOrder());
  api.listOrderRefunds.mockResolvedValue([]);
  api.getCancellationQuote
    .mockResolvedValueOnce(cancellationQuote())
    .mockResolvedValueOnce(
      cancellationQuote({
        quoteToken: "quote_after_change",
        refund: { principalMinor: 50000, feeMinor: 5000, deliveryMinor: 5000, totalMinor: 60000 },
      }),
    );
  api.requestRefund.mockRejectedValue(new ApiError(409, { error: "cancellation_quote_stale" }));
  const stored = (key: string, fileId: string) => ({
    key, phase: "stored" as const, fileName: `${fileId}.png`, localUri: `file:///${fileId}.png`, fileId, progress: 1, error: null,
  });
  useRefundDraft.setState({
    scope: "request:ord_refund_1",
    kind: "cancellation",
    reason: "We moved the event, so we no longer need the flyers.",
    evidence: [],
    qr: stored("q1", "file_client_qr"),
    provider: "gcash",
    accountName: "Ana Santos",
    ownershipConfirmed: true,
  });
  await renderScreen(<RefundRequestScreen />);

  expect(await screen.findByText("You get back ₱710.00")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Send refund request" }));
  fireEvent.press(await screen.findByText("Cancel and send"));

  await waitFor(() => expect(api.requestRefund).toHaveBeenCalledTimes(1));
  expect(api.requestRefund.mock.calls[0][1].cancellationQuoteToken).toBe("quote_after_start");

  expect(await screen.findByText("You get back ₱600.00")).toBeTruthy();
  expect(screen.getByText("Check the amount again")).toBeTruthy();
  expect(screen.getByText(/You now get back ₱600.00/)).toBeTruthy();
  expect(api.getCancellationQuote).toHaveBeenCalledTimes(2);
  // Asked again, not sent again.
  expect(api.requestRefund).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
  expect(useRefundDraft.getState().idempotencyKey).toBeNull();
});
