import type { Order } from "@/lib/api";
import { balanceDue, downpaymentDue, installmentUnderReview, payableInstallment } from "@/lib/payment";
import { receiptFromCheckout, receiptFromInvoice, receiptPaymentLine, withBasket } from "@/lib/receipt";
import { refundEntry } from "@/lib/refunds";
import { combinedInvoice, placedBasket } from "@/test/multiShopFixtures";
import { placed } from "@/test/voucherPlaceHarness";

it("suppresses ordinary QR installment requests and review on all cash orders", () => {
  const order = { state: "awaiting_initial_payment", cash: { method: "cash", status: "due", version: 1 }, payments: { initial: { status: "not_submitted", amountMinor: 6900 } } } as Order;
  expect(downpaymentDue(order)).toBe(false);
  expect(payableInstallment(order)).toBeNull();
  order.state = "ready_for_dispatch";
  order.payments = { initial: { status: "confirmed" }, final_online: { status: "not_submitted", amountMinor: 2000 } } as Order["payments"];
  expect(balanceDue(order)).toBe(false);
  order.payments!.initial!.status = "pending_confirmation";
  expect(installmentUnderReview(order)).toBeNull();
});
it("draws a cash checkout receipt without calling it paid by QR", () => {
  const result = placed({ method: "cash", downpaymentStatus: "not_submitted" }, { method: "cash" });
  const view = receiptFromCheckout(result.invoice, result.order, "old-qr-reference")!;
  expect(view.paymentReference).toBeNull();
  expect(receiptPaymentLine(view)).toBe("Cash on delivery · not collected yet");
  const order = { cash: { method: "cash", status: "collected", version: 2 } } as Order;
  expect(receiptPaymentLine(receiptFromInvoice(result.invoice, order))).toBe("Paid in cash on delivery");
  order.cash!.status = "no_show_repaid";
  expect(receiptPaymentLine(receiptFromInvoice(result.invoice, order))).toBe("Cash order · repaid online");
});

it("does not offer the online change-of-mind refund flow for a cash order", () => {
  const order = { state: "production", cash: { method: "cash", status: "collected", version: 2 }, payments: { initial: { method: "cash", status: "confirmed", amountMinor: 6900 } }, timeline: [] } as unknown as Order;
  expect(refundEntry(order, [])).toEqual({ kind: "none" });
});

it("keeps independently collected deliveries from making the whole basket look paid", () => {
  const invoice = combinedInvoice();
  invoice.paymentPlan.method = "cash";
  const order = { cash: { method: "cash", status: "collected", version: 2 } } as Order;
  const basket = placedBasket(["production", "production", "production"]);
  basket.groups = basket.groups.map((group, index) => ({ ...group, order: { cash: { method: "cash", status: index === 0 ? "collected" : "due", version: 2 } } as Order }));
  const view = withBasket(receiptFromInvoice(invoice, order), basket);
  expect(receiptPaymentLine(view)).toBe("Cash on delivery · collected separately for each delivery");
  expect(view.groups?.[0].cashLine).toBe("Paid in cash on delivery");
  expect(view.groups?.[1].cashLine).toBe("Cash on delivery · not collected yet");
});
