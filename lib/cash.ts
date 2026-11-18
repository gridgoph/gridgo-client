/** Cash checkout and client copy. Amounts are GRIDGO's fee-inclusive centavos. */
import type { CashDetail, Cart, Order, PlatformSettings, User } from "@/lib/api";
import { formatPhp } from "@/lib/api";

export const CASH_BARRED_REASON = "Cash is unavailable after an approved missed delivery or refusal. Repay the order and its delivery fare online; Operations must confirm it before you can use cash again.";

export function cashCheckoutChoice(
  settings: PlatformSettings | null,
  user: User | null,
  cart: Cart | null,
  barred = false,
): { eligible: boolean; reason: string | null } {
  if (barred) return { eligible: false, reason: CASH_BARRED_REASON };
  if (settings?.cash?.enabled !== true) return { eligible: false, reason: null };
  if (user?.role !== "client" || user.accountType !== "individual") {
    return { eligible: false, reason: "Cash on delivery is available to individual accounts only." };
  }
  if (cart?.fulfillmentMode !== "delivery") return { eligible: false, reason: "Cash is available for delivery only." };
  const printing = cart.clientQuote?.clientItemSubtotalMinor;
  const total = cart.clientQuote?.totalMinor;
  const limit = settings.cash.limitMinor;
  if (!Number.isSafeInteger(printing) || !Number.isSafeInteger(total) || (total ?? 0) <= 0 || !Number.isSafeInteger(limit)) {
    return { eligible: false, reason: null };
  }
  if ((printing as number) >= limit) {
    return { eligible: false, reason: `Cash is available when the whole order's printing is under ${formatPhp(limit)}, before delivery and discounts.` };
  }
  return { eligible: true, reason: null };
}

export function isCashOrder(order: Partial<Pick<Order, "cash">>): boolean {
  return order.cash?.method === "cash";
}

export function cashDebtOutstanding(order: Partial<Pick<Order, "cash">>): boolean {
  return order.cash?.status === "online_repayment_required";
}

export function cashOrderLine(order: Partial<Pick<Order, "cash">>): string | null {
  if (!isCashOrder(order)) return null;
  switch (order.cash?.status) {
    case "due": return "Cash on delivery · not collected yet";
    case "collected": return "Paid in cash on delivery";
    case "online_repayment_required": return "Cash order · online repayment required";
    case "no_show_repaid": return "Cash order · repaid online";
    case "cancelled": return "Cash order · cancelled";
    case "work_stopped": return "Cash order · paused by GRIDGO";
    default: return "Cash on delivery · check the latest status with GRIDGO";
  }
}

export function repaymentState(cash: Pick<CashDetail, "repayment"> | null | undefined) {
  return cash?.repayment?.status ?? "none";
}

export function cashErrorMessage(code: string): string | null {
  switch (code) {
    case "cash_disabled": return "Cash on delivery is currently unavailable. Choose QR payment to continue.";
    case "cash_client_barred": return CASH_BARRED_REASON;
    case "cash_individual_only": return "Cash on delivery is available to individual accounts only. Choose QR payment to continue.";
    case "cash_delivery_required": return "Cash is available for delivery only. Choose QR payment for pickup.";
    case "cash_limit_exceeded": return "This order is above the current cash limit. Choose QR payment to continue.";
    case "cash_stale": return "This order changed. Refresh its cash status before submitting again.";
    case "cash_repayment_not_available": return "Repayment is no longer available. Refresh the order to see whether Operations is checking or has confirmed a payment.";
    case "cash_transfer_duplicate": return "That payment reference has already been used. Check the reference on your transfer receipt.";
    case "cash_exact_repayment_required": return "The repayment amount changed. Refresh the order and send the exact amount shown.";
    case "cash_idempotency_conflict": return "This payment attempt changed. Refresh the order before trying again.";
    case "cash_route_required": return "This order uses cash on delivery. Open its cash status for the next step.";
    default: return null;
  }
}
