import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import RefundRequestScreen from "@/app/order/refund-request";
import { refund, refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";
import { useRefundDraft } from "@/store/refundDraft";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ orderId: "ord_refund_1" }),
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getOrder: jest.fn(), listOrderRefunds: jest.fn(), requestRefund: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

// Two presses spend the file (see AGENTS.md), so this is its only test.
it("sends the reason, photos and the attested receiving account with one idempotency key", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "payment_authorized", timeline: [] }));
  api.listOrderRefunds.mockResolvedValue([]);
  api.requestRefund.mockResolvedValue(refund({ id: "refund_new" }));
  const stored = (key: string, fileId: string) => ({
    key, phase: "stored" as const, fileName: `${fileId}.png`, localUri: `file:///${fileId}.png`, fileId, progress: 1, error: null,
  });
  useRefundDraft.setState({
    scope: "request:ord_refund_1",
    kind: "cancellation",
    reason: "We moved the event, so we no longer need the flyers.",
    evidence: [stored("e1", "file_evidence_1")],
    qr: stored("q1", "file_client_qr"),
    provider: "gcash",
    accountName: "Ana Santos",
    ownershipConfirmed: true,
  });
  await renderScreen(<RefundRequestScreen />);

  expect(await screen.findByText("You get everything back")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Send refund request" }));
  fireEvent.press(await screen.findByText("Send request"));

  await waitFor(() => expect(api.requestRefund).toHaveBeenCalledTimes(1));
  const [orderId, body, key] = api.requestRefund.mock.calls[0];
  expect(orderId).toBe("ord_refund_1");
  expect(body).toEqual({
    kind: "cancellation",
    reason: "We moved the event, so we no longer need the flyers.",
    evidenceFileIds: ["file_evidence_1"],
    destination: { qrFileId: "file_client_qr", provider: "gcash", accountName: "Ana Santos", ownershipConfirmed: true },
  });
  expect(typeof key).toBe("string");
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/order/refund",
      params: { orderId: "ord_refund_1", refundId: "refund_new" },
    }),
  );
});
