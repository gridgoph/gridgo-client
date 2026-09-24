/**
 * The price a client reads is GRIDGO's, never the shop's.
 *
 * A listing's `basePriceMinor`, `fromPriceMinor`, `effectivePriceMinor` and a
 * cart line's `lineSubtotalMinor` are what the shop typed into its catalogue —
 * its own price, the number it is paid. GRIDGO sells the job at that figure
 * plus its charge (`settings.serviceFeeRateBps`), and the server adds the
 * charge once, on the order's item subtotal, when the order is written. So the
 * shop's figure reached the screen raw ("₱50.00 each") and the total at
 * checkout was bigger than Items + Delivery by an amount nobody named.
 *
 * Every peso drawn for a client goes through here. One rule, the platform's
 * own rounding: a client buys from GRIDGO the way they buy from any shop, so
 * GRIDGO's charge sits inside every figure they read — the listing's "From",
 * the match card, and Printing on checkout, order detail and the receipt,
 * where Printing + Delivery = Total. The `Service fee · N%` row names the
 * rate and carries no peso amount (`ServiceFeeRow explainOnly`), because
 * GRIDGO's cut in pesos appears on no client screen.
 *
 * The order-level figure the server charges is `itemSubtotalMinor +
 * serviceFeeMinor` (`lib/basket.ts`); per-line figures use the same rule per
 * line. They can differ by a centavo per line only when a shop prices in
 * centavos and the rate splits one — at the pilot's 10% on whole pesos they
 * are always equal — and the order-level figure is the one charged.
 */

import type { CartLineRecord } from "@/lib/api";
// Compatibility exports for existing consumers; all markup lives in one helper.
export {
  clientAmountMinor as gridgoPriceMinor,
  clientAmountMinor as gridgoPriceOrNull,
} from "@/lib/gridgoPrice";

/**
 * Why a basket line has no price, in the client's words.
 *
 * `lineSubtotalMinor: null` is a real answer from GRIDGO — the pricer refused
 * this line — and a zero in its place reads as free. The usual reason is a
 * quantity under the shop's minimum, which the line itself can name; anything
 * else (an option the shop retired, a listing taken down) is fixed by opening
 * the line again.
 */
export function unpricedLineReason(line: CartLineRecord): string {
  const minimum = line.listing?.minimumOrderQuantity ?? null;
  if (minimum != null && line.quantity < minimum) {
    return `No price at this quantity — this shop takes orders of ${minimum} and up.`;
  }
  return "No price for this pick — open it and change what you picked.";
}
