/**
 * The digital payment split, as the client meets it.
 *
 * New orders are paid in full up front: one QR transfer covers the whole
 * total, and the balance installment comes back `not_required`. Orders placed
 * under the old plan are paid in two halves — 75% before production, the rest
 * before delivery — and keep that flow to the end. Which plan an order is on
 * is snapshotted per order (`downpaymentPercent`), so every percentage and
 * every "downpayment"/"balance" word a client reads comes from the helpers
 * below, never from a constant in a screen.
 *
 * Every payment is a QR transfer the client makes themselves — GCash, Maya or
 * a bank e-wallet — confirmed by hand by Operations. No money moves through
 * this app, so nothing here may ever read as "paid" on submission.
 *
 * Cash on delivery and Pilot Credits are not payment methods. Both routes are
 * retired server-side; offering either would walk a client into an error.
 */

import type { InstallmentCode, Order, PaymentInstallment, PlatformSettings } from "@/lib/api";

/**
 * The share the old two-half plan took up front. Only a fallback: an order
 * or a settings payload that names its own percentage wins, and an API that
 * predates the setting still writes 75/25 orders.
 */
export const LEGACY_DOWNPAYMENT_PERCENT = 75;
export const FULL_PAYMENT_PERCENT = 100;

/** A usable up-front share, or null for anything a server should not send. */
function validPercent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= FULL_PAYMENT_PERCENT
    ? value
    : null;
}

/** What GRIDGO takes up front on a basket that is not an order yet. */
export function settingsDownpaymentPercent(settings: Pick<PlatformSettings, "downpaymentPercent"> | null | undefined): number {
  return validPercent(settings?.downpaymentPercent) ?? LEGACY_DOWNPAYMENT_PERCENT;
}

type PlanFields = Pick<Order, "payments"> & Partial<Pick<Order, "downpaymentPercent" | "balanceMinor">>;

/**
 * True when this order is paid in one transfer, with no balance step.
 *
 * Any one signal is enough: the snapshotted percentage, a zero balance, or a
 * balance installment the platform marked `not_required`.
 */
export function paysInFull(order: PlanFields): boolean {
  if (validPercent(order.downpaymentPercent) === FULL_PAYMENT_PERCENT) return true;
  if (order.balanceMinor === 0) return true;
  return paymentInstallment(order, "balance")?.status === "not_required";
}

/** The share of the total this order takes up front. */
export function downpaymentPercentOf(order: PlanFields): number {
  if (paysInFull(order)) return FULL_PAYMENT_PERCENT;
  return validPercent(order.downpaymentPercent) ?? LEGACY_DOWNPAYMENT_PERCENT;
}

/** The only method the platform accepts. */
export const PAYMENT_METHOD = "qr_manual";

/**
 * Shortest reference Operations can match against the GRIDGO wallet.
 * GCash references are 13 characters; a stray digit or two is not a reference.
 */
export const MIN_REFERENCE_LENGTH = 4;
export const MAX_REFERENCE_LENGTH = 64;

/**
 * The name of one payment on this order. A paid-in-full order has one
 * payment, and calling it a downpayment would promise a balance that is never
 * coming.
 */
export function installmentLabel(code: InstallmentCode, order?: PlanFields): string {
  if (order && paysInFull(order) && code === "downpayment") {
    return isInstallmentConfirmed(paymentInstallment(order, "downpayment")) ? "Paid in full" : "Pay in full";
  }
  return code === "downpayment" ? "Downpayment" : "Remaining balance";
}

/** The share of the total each half carries, for guidance copy. */
export function installmentSharePercent(code: InstallmentCode, order?: PlanFields): number {
  const upfront = order ? downpaymentPercentOf(order) : LEGACY_DOWNPAYMENT_PERCENT;
  return code === "downpayment" ? upfront : FULL_PAYMENT_PERCENT - upfront;
}

/** The headline on the client's one payment action for this order. */
export function payActionTitle(code: InstallmentCode, order: PlanFields): string {
  if (code === "downpayment") {
    if (paysInFull(order)) return "Pay in full";
    return order.payments?.initial ? "Pay the initial payment" : `Pay the ${downpaymentPercentOf(order)}% downpayment`;
  }
  return order.payments?.final_online
    ? "Pay the final balance"
    : `Pay the remaining ${installmentSharePercent("balance", order)}%`;
}

/**
 * The checkout note on what placing the order does with the money, for a
 * basket GRIDGO will take `percent` of up front.
 */
export function paymentPlanNote(percent: number): string {
  const when = percent >= FULL_PAYMENT_PERCENT
    ? "You pay the whole total now, in one transfer. There is nothing more to pay before delivery."
    : `You send ${percent}% now and the rest before delivery.`;
  return `${when} GRIDGO checks your reference against its wallet by hand, so it is confirmed in working hours rather than instantly.`;
}

/** What the request form says the client will pay, before any price exists. */
export function paymentPlanPreview(percent: number): string {
  return percent >= FULL_PAYMENT_PERCENT
    ? "pay the whole total by QR in one transfer"
    : `pay ${percent}% by QR then the last ${FULL_PAYMENT_PERCENT - percent}% before delivery`;
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
  if (paysInFull(order)) return false;
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
