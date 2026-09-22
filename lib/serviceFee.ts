/**
 * GRIDGO's service fee, as a client is allowed to see it.
 *
 * The rate is not a constant. Operations sets it in `GET /settings`, and a
 * placed order snapshots the rate it was priced at. A hardcoded 3% here would
 * disagree with both the next order and the last one.
 */

/** What the fee is for, shown when a client taps the service-fee row. */
export const SERVICE_FEE_EXPLAINER =
  "The fee directly goes into improving app operations and customer care.";

/**
 * 1,000 bps → "10%"; 300 → "3%"; 1,250 → "12.5%".
 *
 * Trailing zeros are dropped so a whole percent does not read as a decimal.
 */
export function formatServiceFeeRate(bps: number): string {
  if (!Number.isFinite(bps) || bps < 0) return "0%";
  const percent = bps / 100;
  const text = Number.isInteger(percent)
    ? String(percent)
    : percent.toFixed(2).replace(/\.?0+$/, "");
  return `${text}%`;
}

/** The row label, with the live rate when GRIDGO has given one. */
export function serviceFeeLabel(rateBps: number | null | undefined): string {
  if (rateBps == null || !Number.isFinite(rateBps)) return "Service fee";
  return `Service fee · ${formatServiceFeeRate(rateBps)}`;
}

/**
 * Whether the fee belongs on this breakdown.
 *
 * A priced order carries the snapshotted amount. Checkout carries the live
 * rate from settings even before the amount is known. Either is enough to
 * draw the row — hiding it is how the old "Print + Delivery only" sheet
 * buried the charge inside the total.
 */
export function showsServiceFee(input: {
  serviceFeeMinor?: number | null;
  serviceFeeRateBps?: number | null;
}): boolean {
  return input.serviceFeeMinor != null || input.serviceFeeRateBps != null;
}

/**
 * What the client is charged for printing: the shop's items with GRIDGO's
 * charge already inside them.
 *
 * Checkout, order detail and the receipt all state Printing this way, so the
 * three readings of one order agree to the centavo and Printing + Delivery =
 * Total on each of them. The fee is never a second line on top of it — the
 * row that names it is `ServiceFeeRow explainOnly`, label and rate only.
 */
export function printingMinor(
  itemSubtotalMinor: number,
  serviceFeeMinor: number | null | undefined,
): number {
  return itemSubtotalMinor + (serviceFeeMinor ?? 0);
}
