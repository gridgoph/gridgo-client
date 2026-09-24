/**
 * What the client pays for a shop amount: the shop figure plus GRIDGO's fee.
 *
 * Copied from `gridgo-api/src/pricing.js` `gridgoAmountMinor`. The arithmetic
 * is the same half-up basis-point rounding the operational model uses
 * (`(value * rate + 5_000) / 10_000` in integer PHP minor units). Do not
 * invent a second formula here — a centavo of drift between this and the API
 * is a price the sheet and the invoice would disagree on.
 */

const BPS = 10_000n;

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

/**
 * Half-up basis-point share of an amount. Same as `roundBps` on the API.
 */
export function roundBps(valueMinor: number, rateBps: number): number {
  if (!Number.isSafeInteger(valueMinor) || valueMinor < 0) {
    throw new Error("valueMinor must be a non-negative integer in PHP minor units.");
  }
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) {
    throw new Error("rateBps must be a whole number from 0 to 10,000.");
  }
  return Number(divideRounded(BigInt(valueMinor) * BigInt(rateBps), BPS));
}

/**
 * The single client markup: price the shop amount first, then add the fee once.
 * Missing amounts or settings stay unknown; never fall back to a shop price.
 */
export function clientAmountMinor(shopMinor: number, rateBps: number): number;
export function clientAmountMinor(
  shopMinor: number | null | undefined,
  rateBps: number | null | undefined,
): number | null;
export function clientAmountMinor(
  shopMinor: number | null | undefined,
  rateBps: number | null | undefined,
): number | null {
  if (shopMinor == null || rateBps == null) return null;
  return shopMinor + roundBps(shopMinor, rateBps);
}

// Compatibility name for receipt and older consumers; no second formula.
export { clientAmountMinor as gridgoAmountMinor };

/**
 * The figure a client-facing surface should show for a "From" price.
 *
 * Prefer the API's `clientFromPriceMinor` (already marked up). Fall back to
 * applying the same formula locally when the payload is older or the sheet is
 * still computing as options change.
 */
export function clientFromPriceMinorOf(
  item: { fromPriceMinor: number; clientFromPriceMinor?: number | null },
  serviceFeeRateBps?: number | null,
): number | null {
  if (Number.isSafeInteger(item.clientFromPriceMinor)) return item.clientFromPriceMinor as number;
  return clientAmountMinor(item.fromPriceMinor, serviceFeeRateBps);
}
