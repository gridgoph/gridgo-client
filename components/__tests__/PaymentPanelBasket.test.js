/* global jest, beforeEach, afterEach, it, expect */
const React = require("react");
const { act, create } = require("react-test-renderer");
const { PaymentPanel, PaymentUnderReviewCard } = require("@/components/PaymentPanel");
const { useOrderPayment } = require("@/store/checkoutPayment");
const mockSubmitPayment = jest.fn();
const mockSubmitBasket = jest.fn();
const mockGetOrder = jest.fn();
const mockOnSubmitted = jest.fn();
const mockProof = { state: { phase: "stored", fileId: "receipt-1", localUri: "file://receipt.png" }, ocr: { status: "filled", reference: "1234567890123" }, pick: jest.fn(), reset: jest.fn() };
// One shop group of a three-shop basket, after Operations turned the one payment back.
const order = {
  id: "ord_b", basketId: "bsk_1", groupLabel: "Shop B", state: "awaiting_initial_payment", downpaymentPercent: 100, balanceMinor: 0,
  payments: {
    initial: { status: "not_submitted", amountMinor: 24800, rejectionReason: "Reference did not match" },
    final_online: { status: "not_required", amountMinor: 0 },
  },
};
const basket = { id: "bsk_1", totalMinor: 81720, groups: [{ orderId: "ord_a" }, { orderId: "ord_b" }, { orderId: "ord_c" }] };
jest.mock("expo-router", () => ({ useFocusEffect: jest.fn() }));
jest.mock("react-native", () => ({ Image: "Image", Modal: "Modal", Text: "Text", View: "View" }));
jest.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  formatPhp: (value) => `₱${(value / 100).toFixed(2)}`,
  submitPayment: (...args) => mockSubmitPayment(...args),
  submitBasketPayment: (...args) => mockSubmitBasket(...args),
  getOrder: (...args) => mockGetOrder(...args),
  getSettings: async () => ({ paymentQr: { imageUrl: "/public/payment-qr" } }),
}));
jest.mock("@/hooks/usePaymentProof", () => ({ usePaymentProof: () => mockProof }));
jest.mock("@/components/ConfirmDialog", () => ({ ConfirmDialog: "ConfirmDialog" }));
jest.mock("@/components/ErrorState", () => ({ ErrorState: "ErrorState" }));
jest.mock("@/components/form/FormField", () => ({ FormField: "FormField" }));
jest.mock("@/components/form/TextField", () => ({ TextField: "TextField" }));
jest.mock("@/components/PaymentProofRow", () => ({ PaymentProofRow: "PaymentProofRow" }));
jest.mock("@/components/PrimaryButton", () => ({ PrimaryButton: "PrimaryButton" }));
jest.mock("@/components/SecondaryButton", () => ({ SecondaryButton: "SecondaryButton" }));
jest.mock("@/components/QrPaySheet", () => ({ QrPaySheet: "QrPaySheet", paymentQrFromSettings: (settings) => settings?.paymentQr }));
jest.mock("@/components/SpecRow", () => ({ SpecRow: "SpecRow" }));
let view;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  useOrderPayment.getState().reset();
  useOrderPayment.getState().bind("order:ord_b:downpayment");
  useOrderPayment.getState().setReference("1234567890123");
  mockSubmitBasket.mockResolvedValue({ ...basket });
  mockGetOrder.mockResolvedValue({ ...order, state: "initial_payment_review" });
});
afterEach(async () => { if (view) await act(async () => view.unmount()); view = null; });
const texts = () => view.root.findAllByType("Text").map((node) => [].concat(node.props.children).join(""));
it("asks for the basket's one payment and sends it to the basket, never to the group", async () => {
  await act(async () => { view = create(React.createElement(PaymentPanel, { order, installment: "downpayment", basket, onSubmitted: mockOnSubmitted })); });
  expect(view.root.findByType("QrPaySheet").props.downpaymentMinor).toBe(81720);
  expect(texts()).toContain("₱817.20");
  expect(texts()).toContain("One payment for all 3 shops in this order.");
  await act(async () => view.root.findByType("PrimaryButton").props.onPress());
  expect(view.root.findByType("ConfirmDialog").props.body).toContain("₱817.20");
  await act(async () => view.root.findByType("ConfirmDialog").props.onConfirm());
  expect(mockSubmitBasket).toHaveBeenCalledWith("bsk_1", "1234567890123", "receipt-1");
  expect(mockSubmitPayment).not.toHaveBeenCalled();
  expect(mockGetOrder).toHaveBeenCalledWith("ord_b");
  expect(mockOnSubmitted.mock.calls[0][0].state).toBe("initial_payment_review");
});
it("says the one payment covers every shop while it is checked", async () => {
  const pending = { ...order, state: "initial_payment_review", payments: { ...order.payments, initial: { status: "pending_confirmation", amountMinor: 24800, reference: "1234567890123" } } };
  await act(async () => { view = create(React.createElement(PaymentUnderReviewCard, { order: pending, installment: "downpayment", basket })); });
  const rows = view.root.findAllByType("SpecRow").map((row) => [row.props.label, row.props.value]);
  expect(rows).toContainEqual(["Pay in full", "₱817.20"]);
  expect(rows).toContainEqual(["Covers", "All 3 shops in this order"]);
});
