import type { Order, PaymentInstallment } from "@/lib/api";
import { balanceDue, downpaymentDue, installmentUnderReview, payableInstallment } from "@/lib/payment";
import { orderNextAction, orderWaitingOn } from "@/lib/orderState";

const installment = (status: string, amountMinor: number): PaymentInstallment => ({ amountMinor, status, method: "qr_manual", reference: null, submittedAt: null, confirmedAt: null });
function order(finalStatus = "not_submitted"): Order {
  return { state: "out_for_delivery", totalMinor: 112500, payments: { initial: installment("confirmed", 35000), final_online: installment(finalStatus, 77500) } } as unknown as Order;
}

it("asks an out-for-delivery client for the actual final payment from the current API shape", () => {
  expect(balanceDue(order())).toBe(true);
  expect(payableInstallment(order())).toBe("balance");
  expect(orderNextAction(order())?.body).toContain("₱775.00");
  expect(orderNextAction(order())?.body).not.toMatch(/sends a rider|on the press/i);
  expect(orderNextAction(order())?.title).not.toContain("25%");
});
it("shows pending review and never asks for an already confirmed payment", () => {
  expect(installmentUnderReview(order("pending_confirmation"))).toBe("balance");
  expect(payableInstallment(order("pending_confirmation"))).toBeNull();
  expect(orderWaitingOn(order("pending_confirmation"))).toMatch(/handover/i);
  expect(payableInstallment(order("confirmed"))).toBeNull();
});
it("supports initial payment rejection state and avoids inventing an absent final installment", () => {
  const initialOnly = { state: "awaiting_initial_payment", payments: { initial: installment("not_submitted", 50000) } } as unknown as Order;
  expect(downpaymentDue(initialOnly)).toBe(true);
  initialOnly.state = "out_for_delivery";
  expect(balanceDue(initialOnly)).toBe(false);
});
it("uses canonical values when an older alias disagrees", () => {
  const current = order("confirmed");
  current.payments = { ...current.payments, downpayment: installment("confirmed", 35000), balance: installment("not_submitted", 77500) };
  expect(balanceDue(current)).toBe(false);
});

it("does not collect a zero, waived or missing final payment", () => {
  for (const status of ["waived", "not_required"]) expect(balanceDue(order(status))).toBe(false);
  const free = order();
  free.payments!.final_online!.amountMinor = 0;
  expect(balanceDue(free)).toBe(false);
});
