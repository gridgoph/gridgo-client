import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { useSurvey } from "@/store/survey";
import { issuedReceipt } from "@/test/acknowledgementReceiptFixtures";
import { completedOrder, receivedOrder } from "@/test/receivedOrder";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), setParams: jest.fn(), canGoBack: () => true }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "ord_refund_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/lib/api", () => require("@/test/orderScreenMocks").orderScreenApiMock());

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  mockPush.mockReset();
  useSurvey.getState().reset();
  api.listOrderRefunds.mockResolvedValue([]);
  api.getAcknowledgementReceipt.mockReset();
});

/*
  The delivery acknowledgement receipt on the order screen (gridgo-rider#152).
  Render-only, apart from the last test: one press per file (AGENTS.md).
*/

it("leads a delivered door order to its receipt by AR number and issue time", async () => {
  api.getOrder.mockResolvedValue(receivedOrder());
  api.getAcknowledgementReceipt.mockResolvedValue(issuedReceipt());
  await renderScreen(<OrderDetailScreen />);

  expect(
    await screen.findByRole("button", { name: "Acknowledgement receipt. AR-0000000001 · 21 Oct 2026, 9:00 AM" }),
  ).toBeTruthy();
  expect(api.getAcknowledgementReceipt).toHaveBeenCalledWith("ord_refund_1");
});

it("says an order delivered before receipts began has none", async () => {
  api.getOrder.mockResolvedValue(completedOrder());
  api.getAcknowledgementReceipt.mockResolvedValue(null);
  await renderScreen(<OrderDetailScreen />);

  expect(
    await screen.findByRole("button", { name: "Acknowledgement receipt. None — delivered before receipts began" }),
  ).toBeTruthy();
});

it("never reads or offers one for a pick-up order", async () => {
  api.getOrder.mockResolvedValue(completedOrder({ fulfillmentMode: "pickup" }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Grand opening flyers")).toBeTruthy();
  expect(api.getAcknowledgementReceipt).not.toHaveBeenCalled();
  expect(screen.queryByText("Acknowledgement receipt")).toBeNull();
});

it("draws nothing while the order is on its way and the rider has not issued it", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "out_for_delivery", riderId: "user_rider" }));
  api.getAcknowledgementReceipt.mockResolvedValue(null);
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Grand opening flyers")).toBeTruthy();
  expect(api.getAcknowledgementReceipt).toHaveBeenCalledWith("ord_refund_1");
  expect(screen.queryByText("Acknowledgement receipt")).toBeNull();
});

it("shows the receipt as soon as the rider issues it at the door", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "out_for_delivery", riderId: "user_rider" }));
  api.getAcknowledgementReceipt.mockResolvedValue(issuedReceipt({ arNumber: "AR-0000000009" }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText(/^AR-0000000009 · /)).toBeTruthy();
});

it("says when the receipt did not load, with a retry, and keeps the order", async () => {
  api.getOrder.mockResolvedValue(completedOrder());
  api.getAcknowledgementReceipt.mockRejectedValue(new TypeError("Network request failed"));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Your acknowledgement receipt did not load")).toBeTruthy();
  expect(screen.getByText("Grand opening flyers")).toBeTruthy();
});

it("opens the receipt screen from the row", async () => {
  api.getOrder.mockResolvedValue(completedOrder());
  api.getAcknowledgementReceipt.mockResolvedValue(issuedReceipt());
  await renderScreen(<OrderDetailScreen />);

  fireEvent.press(await screen.findByRole("button", { name: /^Acknowledgement receipt\. AR-0000000001/ }));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/order/acknowledgement-receipt",
    params: { orderId: "ord_refund_1" },
  });
});
