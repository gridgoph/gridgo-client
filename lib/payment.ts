/**
 * Pilot payment rules — enforce in UI before the user hits the API error.
 *
 * - Pilot Credits: authorize spend; never offer top-up/purchase/transfer.
 * - COD: total + delivery ≤ ₱1,500 and at most one active unpaid COD order.
 */

/** ₱1,500 in minor units (centavos). */
export const COD_LIMIT_MINOR = 150_000;

export type CodEligibility = {
  eligible: boolean;
  /** Why COD cannot be used, when not eligible. Empty when eligible. */
  reason: string | null;
  /** Always explain the pilot rules before the user submits. */
  limitNotice: string;
  oneActiveNotice: string;
};

export const COD_LIMIT_NOTICE =
  "Cash on Delivery is only available when the order total (including delivery) is ₱1,500 or less.";

export const COD_ONE_ACTIVE_NOTICE =
  "You may have only one unpaid COD order at a time. Finish or pay an open COD order before starting another.";

export const CREDITS_NON_CASH_NOTICE =
  "Pilot Credits are non-cash and non-transferable. They cannot be topped up, purchased, withdrawn, or transferred in this app.";

/** Unpaid / in-flight COD payment statuses that block a second COD order. */
export function isActiveUnpaidCodOrder(order: {
  id: string;
  paymentMethod: string | null;
  paymentStatus: string;
  state: string;
}): boolean {
  if (order.paymentMethod !== "cod") return false;
  if (order.paymentStatus === "collected" || order.paymentStatus === "reconciled") return false;
  if (order.state === "completed" || order.state === "payout_released") return false;
  return true;
}

/**
 * Whether this client may pay `grandTotalMinor` by COD, given their other orders.
 */
export function evaluateCodEligibility(
  grandTotalMinor: number,
  otherOrders: {
    id: string;
    paymentMethod: string | null;
    paymentStatus: string;
    state: string;
  }[],
  currentOrderId?: string,
): CodEligibility {
  const base = {
    limitNotice: COD_LIMIT_NOTICE,
    oneActiveNotice: COD_ONE_ACTIVE_NOTICE,
  };

  if (grandTotalMinor > COD_LIMIT_MINOR) {
    return {
      ...base,
      eligible: false,
      reason: `This order is above the ₱1,500 COD limit.`,
    };
  }

  const openCod = otherOrders.some(
    (o) => o.id !== currentOrderId && isActiveUnpaidCodOrder(o),
  );
  if (openCod) {
    return {
      ...base,
      eligible: false,
      reason: "You already have an unpaid COD order. Only one is allowed at a time.",
    };
  }

  return { ...base, eligible: true, reason: null };
}

/** Shortfall when authorize returns 402 insufficient_credits. */
export function creditsShortfallMinor(needMinor: number, balanceMinor: number): number {
  return Math.max(0, needMinor - balanceMinor);
}

export function formatCreditsShortfallMessage(needMinor: number, balanceMinor: number): string {
  const shortfall = creditsShortfallMinor(needMinor, balanceMinor);
  const php = (n: number) =>
    `₱${(n / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `Not enough Pilot Credits. You need ${php(needMinor)} but have ${php(balanceMinor)} (short by ${php(shortfall)}). Credits cannot be topped up in this app.`;
}
