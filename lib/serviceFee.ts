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
 * Whether Operations wants the client to see that a service fee exists at all.
 *
 * Live `GET /settings` is the authority, and the switch covers every word, not
 * just the `Service fee · N%` row: the row, its explainer, the checkout note,
 * the receipt-ready notification. With it off a client sees no sign of a fee
 * anywhere — the pesos stay inside Printing either way, so no total moves.
 *
 * An older payload without the flag keeps the fee named — hiding is an
 * explicit off. Settings not read yet (`null`) cannot say the switch is on, so
 * nothing is named until they are: a fee shown for a second and then hidden
 * is still a fee shown.
 */
export function serviceFeeVisibleToClient(
  settings: { serviceFeeVisibleToClient?: boolean | null } | null | undefined,
): boolean {
  if (!settings) return false;
  return settings.serviceFeeVisibleToClient !== false;
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

/**
 * Printing on a placed order, as the client was charged it.
 *
 * The saved total less the saved fulfilment charge (gridgo-api#132): both
 * figures are already GRIDGO's, so nothing here touches the shops' own
 * subtotal. A new pick-up order's `deliveryFeeMinor` already carries its hub
 * fee, so the subtraction stays right there too. An order with no total yet —
 * a legacy one still waiting on a quote — falls back to items plus fee.
 */
export function orderPrintingMinor(order: {
  totalMinor?: number | null;
  deliveryFeeMinor?: number | null;
  subtotalMinor?: number | null;
  serviceFeeMinor?: number | null;
  organizationDiscountMinor?: number | null;
  voucherDiscountMinor?: number | null;
}): number | null {
  if (order.totalMinor != null && order.deliveryFeeMinor != null) {
    // An organization's discount and a voucher are already out of the total;
    // Printing is drawn before them, each on its own line (#166,
    // gridgo-api#204). Delivery stays the gross charge, so Printing +
    // Delivery − discount = Total.
    const discount = order.organizationDiscountMinor ?? 0;
    const voucher = order.voucherDiscountMinor ?? 0;
    return order.totalMinor - order.deliveryFeeMinor + (discount > 0 ? discount : 0) + (voucher > 0 ? voucher : 0);
  }
  if (order.subtotalMinor == null) return null;
  return printingMinor(order.subtotalMinor, order.serviceFeeMinor);
}
