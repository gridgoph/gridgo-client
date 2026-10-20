import { cleanup, screen } from "@testing-library/react-native";

import AcknowledgementReceiptScreen from "@/app/order/acknowledgement-receipt";
import { ApiError } from "@/lib/api";
import { issuedReceipt } from "@/test/acknowledgementReceiptFixtures";
import { completedOrder } from "@/test/receivedOrder";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ orderId: "ord_refund_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getAcknowledgementReceipt: jest.fn(),
  getOrder: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  api.getOrder.mockResolvedValue(completedOrder());
});

/*
  Render-only: every state the contract documents. The two presses (download
  and retry) have a file each — one press per test, see AGENTS.md.
*/

it("draws the issued receipt exactly as GRIDGO froze it, and never calls it official", async () => {
  api.getAcknowledgementReceipt.mockResolvedValue(issuedReceipt());
  await renderScreen(<AcknowledgementReceiptScreen />);

  expect(await screen.findByText("AR-0000000001")).toBeTruthy();
  expect(screen.getByText("Acknowledgement receipt")).toBeTruthy();
  expect(screen.getByText(/^This is not an official receipt\./)).toBeTruthy();
  expect(screen.queryByText(/^Official receipt/i)).toBeNull();

  // The facts: number, order, date in Davao time, who it was issued to.
  expect(screen.getByText("AR number")).toBeTruthy();
  expect(screen.getByText("Order number")).toBeTruthy();
  expect(screen.getByText("REFUND_1")).toBeTruthy();
  expect(screen.getByText("21 Oct 2026, 9:00 AM")).toBeTruthy();
  expect(screen.getByText("Maria Santos")).toBeTruthy();

  // Each line's stored subtotal, with its rate — or "not recorded", never a guess.
  expect(screen.getByText("Flyers")).toBeTruthy();
  expect(screen.getByText("Qty 100 · ₱55.06 each")).toBeTruthy();
  expect(screen.getByText("Event poster")).toBeTruthy();
  expect(screen.getByText("Qty 1 · Unit rate not recorded")).toBeTruthy();
  expect(screen.getAllByText("₱55.06")).toHaveLength(2);

  // Delivery always; rounding because it is not zero; no discount rows at zero.
  expect(screen.getByText("Delivery fee")).toBeTruthy();
  expect(screen.getByText("₱50.00")).toBeTruthy();
  expect(screen.getByText("Rounding adjustment")).toBeTruthy();
  expect(screen.getByText("−₱0.01")).toBeTruthy();
  expect(screen.queryByText("Organization discount")).toBeNull();
  expect(screen.queryByText("Voucher discount")).toBeNull();
  expect(screen.getByText("Grand total")).toBeTruthy();

  // The payment as recorded: a manual QR is not named as any wallet.
  expect(screen.getByText("PAYMENT AS RECORDED")).toBeTruthy();
  expect(screen.getByText("Digital · QR payment")).toBeTruthy();
  expect(screen.getByText("QR-REF-2026")).toBeTruthy();
  expect(screen.getAllByText("₱160.11")).toHaveLength(2);
  expect(screen.queryByText(/GCash|Maya|QR Ph/)).toBeNull();

  // GRIDGO's note, exactly as sent, and the way to keep a copy.
  expect(screen.getByText(issuedReceipt().note)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Download receipt (PDF)" })).toBeTruthy();
});

it("draws discounts, cash received and change only when GRIDGO recorded them", async () => {
  api.getAcknowledgementReceipt.mockResolvedValue(
    issuedReceipt({
      organizationDiscountMinor: 2500,
      voucherDiscountMinor: 1000,
      roundingAdjustmentMinor: 0,
      payments: [
        { code: "initial", type: "digital", method: "gcash", reference: null, amountMinor: 10000, amountReceivedMinor: null, changeMinor: null },
        { code: "final_cash", type: "cash", method: "cash", reference: null, amountMinor: 2511, amountReceivedMinor: 3000, changeMinor: 489 },
      ],
    }),
  );
  await renderScreen(<AcknowledgementReceiptScreen />);

  expect(await screen.findByText("Organization discount")).toBeTruthy();
  expect(screen.getByText("−₱25.00")).toBeTruthy();
  expect(screen.getByText("Voucher discount")).toBeTruthy();
  expect(screen.getByText("−₱10.00")).toBeTruthy();
  expect(screen.queryByText("Rounding adjustment")).toBeNull();
  expect(screen.getByText("Payment 1 of 2")).toBeTruthy();
  expect(screen.getByText("Payment 2 of 2")).toBeTruthy();
  expect(screen.getByText("Digital · GCash")).toBeTruthy();
  expect(screen.getAllByText("Not recorded")).toHaveLength(2);
  expect(screen.getByText("Amount received")).toBeTruthy();
  expect(screen.getByText("₱30.00")).toBeTruthy();
  expect(screen.getByText("Change")).toBeTruthy();
  expect(screen.getByText("₱4.89")).toBeTruthy();
});

it("names the shop group on a multi-shop order and says each part has its own receipt", async () => {
  api.getOrder.mockResolvedValue(
    completedOrder({ basketId: "bsk_1", groupLabel: "Shop B", deadline: "2026-10-24T10:00:00+08:00" }),
  );
  api.getAcknowledgementReceipt.mockResolvedValue(issuedReceipt({ arNumber: "AR-0000000012" }));
  await renderScreen(<AcknowledgementReceiptScreen />);

  expect(await screen.findByText("AR-0000000012")).toBeTruthy();
  expect(screen.getByText(/^SHOP B · /)).toBeTruthy();
  expect(
    screen.getByText(/Each part of a multi-shop order has its own acknowledgement receipt and number\. This one covers Shop B only\./),
  ).toBeTruthy();
});

it("still draws an issued receipt when the order itself does not load", async () => {
  api.getOrder.mockRejectedValue(new TypeError("Network request failed"));
  api.getAcknowledgementReceipt.mockResolvedValue(issuedReceipt());
  await renderScreen(<AcknowledgementReceiptScreen />);

  expect(await screen.findByText("AR-0000000001")).toBeTruthy();
  expect(screen.queryByText(/multi-shop/)).toBeNull();
});

it("says plainly that an order delivered before receipts began has none", async () => {
  api.getAcknowledgementReceipt.mockResolvedValue(null);
  await renderScreen(<AcknowledgementReceiptScreen />);

  expect(await screen.findByText("Delivered before receipts began")).toBeTruthy();
  expect(screen.getByText(/delivered before GRIDGO started issuing acknowledgement receipts, so it does not have one/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "View order receipt" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "View this order" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Download receipt (PDF)" })).toBeNull();
});

it("tells a pick-up client that collected orders get no acknowledgement receipt", async () => {
  api.getOrder.mockResolvedValue(completedOrder({ fulfillmentMode: "pickup" }));
  api.getAcknowledgementReceipt.mockResolvedValue(null);
  await renderScreen(<AcknowledgementReceiptScreen />);

  expect(await screen.findByText("No acknowledgement receipt for pick-up")).toBeTruthy();
  expect(screen.getByText(/You collect this order at GRIDGO Office, so it does not get one/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "View order receipt" })).toBeTruthy();
});

it("says the rider prepares it at the door while the order is on its way", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "out_for_delivery", riderId: "user_rider" }));
  api.getAcknowledgementReceipt.mockResolvedValue(null);
  await renderScreen(<AcknowledgementReceiptScreen />);

  expect(await screen.findByText("Not issued yet")).toBeTruthy();
  expect(screen.getByText(/Your rider prepares the acknowledgement receipt at your door/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "View order receipt" })).toBeNull();
});

it("says who may see the receipt when GRIDGO refuses, with a retry", async () => {
  api.getAcknowledgementReceipt.mockRejectedValue(new ApiError(403, { error: "forbidden" }));
  await renderScreen(<AcknowledgementReceiptScreen />);

  expect(await screen.findByText("Not your receipt")).toBeTruthy();
  expect(screen.getByText("Only the account that placed this order can see its acknowledgement receipt.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
});

it("fails honestly when neither the receipt nor the order loads", async () => {
  api.getOrder.mockRejectedValue(new ApiError(404, { error: "order_not_found" }));
  api.getAcknowledgementReceipt.mockResolvedValue(null);
  await renderScreen(<AcknowledgementReceiptScreen />);

  expect(await screen.findByText("Order not found")).toBeTruthy();
  expect(screen.queryByText("Delivered before receipts began")).toBeNull();
});
