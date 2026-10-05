import type { Cart, CartQuote, CartQuoteDeliveryLine, DistanceZone } from "@/lib/api";
import { clientLineAmountMinor } from "@/lib/basket";
import { roundBps } from "@/lib/gridgoPrice";

/**
 * `cart.clientQuote` the way gridgo-api builds it (gridgo-api#146), for
 * screen tests: GRIDGO printing per line, one delivery leg per print run,
 * any pick-up fee inside delivery, then the total and the up-front share.
 * Checkout draws these figures as sent, so a test sets them here.
 */
export type QuoteOptions = {
  /** GRIDGO's rate, for a fixture line that carries only the shop's figure. */
  rateBps?: number;
  /** One per print run, in basket order. Null leaves that leg unpriced. */
  legs?: ({ feeMinor: number | null; zone?: DistanceZone | null; distanceKm?: number } | null)[];
  pickupFeeMinor?: number;
  downpaymentPercent?: number;
};


export function cartQuote(cart: Pick<Cart, "lines" | "fulfillmentMode">, options: QuoteOptions = {}): CartQuote {
  const rate = options.rateBps ?? 1000;
  const runs = new Map<string, string[]>();
  for (const line of cart.lines) runs.set(line.supplierId, [...(runs.get(line.supplierId) ?? []), line.id]);
  const amounts = cart.lines.map((line) => clientLineAmountMinor(line, rate));
  const reasons: CartQuote["reasons"] = cart.lines
    .filter((_, index) => amounts[index] == null)
    .map((line) => ({ code: "line_unpriced", lineId: line.id }));
  const clientItemSubtotalMinor = amounts.some((amount) => amount == null)
    ? null
    : amounts.reduce<number>((sum, amount) => sum + (amount as number), 0);
  const deliveryLines: CartQuoteDeliveryLine[] =
    cart.fulfillmentMode === "pickup"
      ? []
      : [...runs.values()].map((lineIds, index) => {
          const leg = options.legs?.[index] === undefined ? { feeMinor: 2500 } : options.legs[index];
          return {
            lineIds,
            distanceZone: leg?.feeMinor == null ? null : (leg.zone ?? null),
            deliveryFeeMinor: leg?.feeMinor ?? null,
            ...(leg?.distanceKm != null ? { distanceKm: leg.distanceKm } : {}),
          };
        });
  if (deliveryLines.some((leg) => leg.deliveryFeeMinor == null)) {
    reasons.push({ code: "dropoff_required", lineIds: cart.lines.map((line) => line.id) });
  }
  const pickup = options.pickupFeeMinor;
  const deliveryFeeMinor = deliveryLines.some((leg) => leg.deliveryFeeMinor == null)
    ? null
    : deliveryLines.reduce((sum, leg) => sum + (leg.deliveryFeeMinor ?? 0), pickup ?? 0);
  const totalMinor =
    reasons.length || clientItemSubtotalMinor == null || deliveryFeeMinor == null
      ? null
      : clientItemSubtotalMinor + deliveryFeeMinor;
  const downpaymentPercent = options.downpaymentPercent ?? 75;
  const downpaymentMinor = totalMinor == null ? null : roundBps(totalMinor, downpaymentPercent * 100);
  return {
    status: totalMinor == null ? "incomplete" : "priced",
    reasons,
    clientItemSubtotalMinor,
    deliveryLines,
    deliveryFeeMinor,
    totalMinor,
    ...(pickup != null ? { pickupFeeMinor: pickup } : {}),
    downpaymentPercent,
    downpaymentMinor,
    balanceMinor: totalMinor == null || downpaymentMinor == null ? null : totalMinor - downpaymentMinor,
  };
}

/** The cart with its quote, computed after any overrides. */
export function withQuote(cart: Cart, options: QuoteOptions = {}): Cart {
  return { ...cart, clientQuote: cartQuote(cart, options) };
}
