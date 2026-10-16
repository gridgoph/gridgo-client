import type { Cart, Voucher } from "@/lib/api";
import { roundBps } from "@/lib/gridgoPrice";

/** Fixed "now" for voucher tests: Fri 9 Oct 2026, 4:00 PM in Davao. */
export const VOUCHER_NOW = Date.parse("2026-10-09T08:00:00.000Z");
export const HOUR = 3_600_000;

/** A wallet item the way `GET /me/vouchers` writes it (gridgo-api#204). */
export function voucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: "vch_1",
    campaignId: "vcamp_1",
    name: "Soft-launch tester thanks",
    valueMinor: 1500,
    status: "available",
    issuedAt: "2026-10-09T08:00:00.000Z",
    expiresAt: "2026-10-16T08:00:00.000Z",
    secondsRemaining: 604800,
    redeemable: true,
    reservation: null,
    fundedBy: "GRIDGO",
    transferable: false,
    cashValue: false,
    ...overrides,
  };
}

/**
 * The basket with a voucher on its quote, as gridgo-api prices it: the
 * discount already out of the total and the up-front share, Printing and
 * Delivery left gross.
 */
export function withVoucher(cart: Cart, applied: Voucher, amountMinor = applied.valueMinor): Cart {
  const quote = cart.clientQuote;
  if (!quote || quote.totalMinor == null) throw new Error("withVoucher needs a priced quote");
  const totalMinor = quote.totalMinor - amountMinor;
  const downpaymentMinor = roundBps(totalMinor, quote.downpaymentPercent * 100);
  return {
    ...cart,
    clientQuote: {
      ...quote,
      voucher: applied,
      voucherDiscountMinor: amountMinor,
      discountKind: "voucher",
      organizationDiscountMinor: 0,
      totalMinor,
      downpaymentMinor,
      balanceMinor: totalMinor - downpaymentMinor,
    },
  };
}
