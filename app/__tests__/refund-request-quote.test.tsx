import { screen } from "@testing-library/react-native";

import RefundRequestScreen from "@/app/order/refund-request";
import { ApiError } from "@/lib/api";
import { useRefundDraft } from "@/store/refundDraft";
import { cancellationQuote } from "@/test/cancellationQuote";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";
import { setServiceFeeSwitch } from "@/test/serviceFeeSwitch";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
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

beforeEach(() => {
  useRefundDraft.getState().reset();
  api.getOrder.mockResolvedValue(refundOrder());
  api.listOrderRefunds.mockResolvedValue([]);
});

it("shows the exact amount a cancellation returns after printing starts, before anything is sent", async () => {
  setServiceFeeSwitch(true);
  api.getCancellationQuote.mockResolvedValue(cancellationQuote());
  await renderScreen(<RefundRequestScreen />);

  expect(await screen.findByText("You get back ₱710.00")).toBeTruthy();
  expect(api.getCancellationQuote).toHaveBeenCalledWith("ord_refund_1");
  expect(screen.getByText(/work already done is kept/)).toBeTruthy();
  expect(screen.getByText("Partial refund · ₱710.00 of ₱1,150.00 paid")).toBeTruthy();
  // Printing carries the returned fee inside it: ₱600 + ₱60.
  expect(screen.getByText("₱660.00")).toBeTruthy();
  expect(screen.getByText("₱50.00")).toBeTruthy();
  expect(screen.getByText("Service fee · 10%")).toBeTruthy();
  expect(screen.queryByText("₱60.00")).toBeNull();
  expect(screen.getByText(/This is the exact amount/)).toBeTruthy();
  expect(api.requestRefund).not.toHaveBeenCalled();
});

it("still lets a cancellation go when Operations must work the amount out, without inventing one", async () => {
  api.getCancellationQuote.mockRejectedValue(new ApiError(409, { error: "cancellation_manual_review_required" }));
  await renderScreen(<RefundRequestScreen />);

  expect(await screen.findByText("Operations works out the amount")).toBeTruthy();
  expect(screen.getByText(/they tell you the amount before anything is approved/)).toBeTruthy();
  expect(screen.queryByText(/You get back/)).toBeNull();
  // Only the reason and account are still missing — the refusal does not block it.
  expect(screen.getByText(/Say why you want a refund/)).toBeTruthy();
});

it("blocks a cancellation the platform refuses, in plain words", async () => {
  api.getCancellationQuote.mockRejectedValue(new ApiError(409, { error: "refund_no_available_funds" }));
  await renderScreen(<RefundRequestScreen />);

  expect(await screen.findByText("This order cannot be cancelled here")).toBeTruthy();
  expect(screen.getByText(/nothing to refund/)).toBeTruthy();
  expect(screen.getByText("This order cannot be cancelled from here.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send refund request" })).toBeDisabled();
});
