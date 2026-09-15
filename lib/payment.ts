/**
 * The digital payment split, as the client meets it.
 *
 * One order is paid in two halves: 75% before production, 25% before delivery.
 * Both are QR transfers the client makes themselves — GCash, Maya or a bank
 * e-wallet — and both are confirmed by hand by Operations. No money moves
 * through this app, so nothing here may ever read as "paid" on submission.
 *
 * Cash on delivery and Pilot Credits are not payment methods. Both routes are
 * retired server-side; offering either would walk a client into an error.
 */

import type { InstallmentCode, Order, PaymentInstallment } from "@/lib/api";

export const DOWNPAYMENT_PERCENT = 75;
export const BALANCE_PERCENT = 25;

/** The only method the platform accepts. */
export const PAYMENT_METHOD = "qr_manual";

/**
 * Shortest reference Operations can match against the GRIDGO wallet.
 * GCash references are 13 characters; a stray digit or two is not a reference.
 */
export const MIN_REFERENCE_LENGTH = 4;
export const MAX_REFERENCE_LENGTH = 64;

export function installmentLabel(code: InstallmentCode): string {
  return code === "downpayment" ? "Downpayment" : "Remaining balance";
}

/** The share of the total each half carries, for guidance copy. */
export function installmentSharePercent(code: InstallmentCode): number {
  return code === "downpayment" ? DOWNPAYMENT_PERCENT : BALANCE_PERCENT;
}

export function isInstallmentConfirmed(installment: PaymentInstallment | undefined): boolean {
  // `legacy_confirmed` is what migration left on orders paid under the old
  // single-authorization model. It counts as paid, and nothing is owed on it.
  return installment?.status === "confirmed" || installment?.status === "legacy_confirmed";
}

export function isInstallmentSubmitted(installment: PaymentInstallment | undefined): boolean {
  return installment?.status === "pending_confirmation";
}

/** Ask during production and transport; final handover waits on Ops confirmation. */
export const BALANCE_DUE_STATES = [
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "awaiting_collection",
] as const;

/** Canonical server keys win; older deployments may still return the aliases. */
export function paymentInstallment(order: Pick<Order, "payments">, code: InstallmentCode): PaymentInstallment | undefined {
  const payments = order.payments;
  return code === "downpayment"
    ? payments?.initial ?? payments?.downpayment
    : payments?.final_online ?? payments?.balance;
}

export function downpaymentDue(order: Order): boolean {
  if (!["awaiting_downpayment", "awaiting_initial_payment"].includes(order.state)) return false;
  const installment = paymentInstallment(order, "downpayment");
  return Boolean(installment && installment.amountMinor != null && installment.amountMinor > 0 && ["not_submitted", "rejected"].includes(installment.status));
}

export function balanceDue(order: Order): boolean {
  if (!(BALANCE_DUE_STATES as readonly string[]).includes(order.state)) return false;
  if (order.payments?.initial
    ? order.payments.initial.status !== "confirmed"
    : !isInstallmentConfirmed(paymentInstallment(order, "downpayment"))) return false;
  const installment = paymentInstallment(order, "balance");
  return Boolean(installment && installment.amountMinor != null && installment.amountMinor > 0 && ["not_submitted", "rejected"].includes(installment.status));
}

/** Which half — if either — the client is currently waiting on a check for. */
export function installmentUnderReview(order: Order): InstallmentCode | null {
  if (isInstallmentSubmitted(paymentInstallment(order, "downpayment"))) return "downpayment";
  if (isInstallmentSubmitted(paymentInstallment(order, "balance"))) return "balance";
  return null;
}

/** The half this order is asking the client to pay, if any. */
export function payableInstallment(order: Order): InstallmentCode | null {
  if (downpaymentDue(order)) return "downpayment";
  if (balanceDue(order)) return "balance";
  return null;
}

/**
 * The constraint, said before the client hits it rather than after.
 * Both halves are digital; there is no cash option and no credit option.
 */
export const DIGITAL_ONLY_NOTICE =
  "GRIDGO takes payment by QR only — GCash, Maya or a bank e-wallet. There is no cash on delivery.";

export const MANUAL_CONFIRMATION_NOTICE =
  "Operations matches your reference against the GRIDGO wallet by hand, so it is checked in working hours rather than instantly.";

export function payInstruction(code: InstallmentCode): string {
  return code === "downpayment"
    ? "Open the GRIDGO QR below, pay the amount shown, then upload the receipt and check its reference number."
    : "Use the same GRIDGO QR to pay the remaining balance. Upload your receipt, then check or correct the reference read from it.";
}

export function afterPayCopy(code: InstallmentCode): string {
  return code === "downpayment"
    ? "Your supplier starts production once Operations confirms this."
    : "Final handover is allowed once Operations confirms this.";
}

export type ReferenceCheck = { ok: boolean; reason: string | null };

/**
 * Enough of a reference for Operations to find the transfer.
 * The API rejects an empty one; this says so before the round trip.
 */
export function checkPaymentReference(reference: string): ReferenceCheck {
  const trimmed = reference.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: "Enter the reference number from your payment receipt. Operations finds your transfer by it.",
    };
  }
  if (trimmed.length < MIN_REFERENCE_LENGTH) {
    return {
      ok: false,
      reason: `That is too short to be a reference number. Copy the whole one from your receipt — GCash's is 13 characters.`,
    };
  }
  if (trimmed.length > MAX_REFERENCE_LENGTH) {
    return {
      ok: false,
      reason: "That is longer than any wallet reference. Enter just the reference number, not the whole receipt.",
    };
  }
  return { ok: true, reason: null };
}
