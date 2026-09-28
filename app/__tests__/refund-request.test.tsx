import { screen } from "@testing-library/react-native";

import RefundRequestScreen from "@/app/order/refund-request";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ orderId: "ord_refund_1" }),
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getOrder: jest.fn(), listOrderRefunds: jest.fn(), requestRefund: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("explains a partial refund and the deadline before asking anything", async () => {
  api.getOrder.mockResolvedValue(
    refundOrder({
      state: "issue_window_open",
      issueWindowOpenedAt: "2026-09-28T09:00:00+08:00",
      issueWindowExpiresAt: "2099-09-29T09:00:00+08:00",
    }),
  );
  api.listOrderRefunds.mockResolvedValue([]);
  await renderScreen(<RefundRequestScreen />);

  expect(await screen.findByText("What you can get back")).toBeTruthy();
  expect(screen.getByText(/Work already paid for is not taken back/)).toBeTruthy();
  expect(screen.getByText(/You can ask until .*2099.*Telling GRIDGO everything is fine ends the time to ask early/)).toBeTruthy();
  // After handover the likelier request is a complaint, chosen for them.
  expect(await screen.findByText("Something is wrong with it")).toBeTruthy();
  expect(screen.getByText("Upload receiving QR")).toBeTruthy();
  expect(screen.getByLabelText("This receiving account is mine")).toBeTruthy();
  // Nothing is sendable until the reason and account are there, and the bar says why.
  expect(screen.getByText(/Say why you want a refund/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send refund request" })).toBeDisabled();
});
