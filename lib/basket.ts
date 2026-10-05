/**
 * What the basket comes to, before GRIDGO writes the order.
 *
 * GRIDGO works it out, not the phone (gridgo-api#132, #146). Every draft cart
 * carries `clientQuote`: the printing at GRIDGO's price, one delivery leg per
 * print run with its zone, any pick-up fee, the total and the up-front share —
 * all already the client's figures, computed by the same engine checkout
 * uses. The sheet reads those. It no longer downloads a shop's board to learn
 * where the press is and measure the distance itself: that put the shop's pin
 * on the phone, and two copies of the arithmetic were two chances to disagree
 * with the invoice.
 *
 * Where GRIDGO cannot yet know a figure, neither can this. An incomplete
 * quote (no address, an unpriced line) has no total, and the sheet says so
 * rather than showing a number that will move.
 *
 * The grouping is by supplier because that is what the money does — one press
 * is one print run, one drop and one delivery charge — but nothing here carries
 * a shop's name. The client is buying from GRIDGO; a run is "Print run 1", and
 * the supplier id stays where it belongs, in the calls.
 */

import type { Cart, CartLineRecord, CartQuote, DistanceZone, PlatformSettings } from "@/lib/api";
import { lineHasArtwork } from "@/lib/designLink";
import { clientAmountMinor, roundBps } from "@/lib/gridgoPrice";
import { settingsDownpaymentPercent } from "@/lib/payment";

export { roundBps } from "@/lib/gridgoPrice";
export { deliveryFeeForDistance } from "@/lib/distanceZone";

export type PrintRun = {
  supplierId: string;
  /** What the client calls this run. Never a shop. */
  runLabel: string;
  lines: CartLineRecord[];
  /**
   * GRIDGO's figure for the run, or null while any line in it has none.
   * GRIDGO answers a null line amount for a line its pricer refused; counting
   * that as zero is what showed a lanyard at PHP 0.00.
   */
  clientSubtotalMinor: number | null;
};

/** Adds figures that may be missing; one missing makes the sum missing. */
function sumMinor(amounts: (number | null)[]): number | null {
  let total = 0;
  for (const amount of amounts) {
    if (amount == null) return null;
    total += amount;
  }
  return total;
}

/**
 * What a client-facing surface shows for one basket line: the API's
 * `clientLineSubtotalMinor`, already GRIDGO's price. Only a payload from
 * before that field falls back to marking up the shop's figure, the same
 * half-up rule the listing used. Null is "not priced", never zero.
 */
export function clientLineAmountMinor(
  line: Pick<CartLineRecord, "lineSubtotalMinor" | "clientLineSubtotalMinor">,
  serviceFeeRateBps: number | null | undefined,
): number | null {
  if (line.clientLineSubtotalMinor !== undefined) {
    return Number.isSafeInteger(line.clientLineSubtotalMinor) ? (line.clientLineSubtotalMinor as number) : null;
  }
  return clientAmountMinor(line.lineSubtotalMinor, serviceFeeRateBps);
}

/**
 * The basket by print run, in the order the runs were first started.
 *
 * A run is one press, so the split is what decides delivery: two runs is two
 * drops and two fees. The client is told that; they are not told whose presses
 * they are.
 */
export function printRuns(lines: CartLineRecord[], serviceFeeRateBps?: number | null): PrintRun[] {
  const groups = new Map<string, CartLineRecord[]>();
  for (const line of lines) {
    const existing = groups.get(line.supplierId);
    if (existing) existing.push(line);
    else groups.set(line.supplierId, [line]);
  }
  return [...groups.entries()].map(([supplierId, runLines], index) => ({
    supplierId,
    runLabel: `Print run ${index + 1}`,
    lines: runLines,
    clientSubtotalMinor: sumMinor(
      runLines.map((line) => clientLineAmountMinor(line, serviceFeeRateBps)),
    ),
  }));
}

export type DeliveryLeg = {
  /** Which run this leg carries, by the lines GRIDGO grouped into it. */
  runLabel: string;
  lineIds: string[];
  /** The zone the run's farthest drop falls in, as GRIDGO measured it. */
  zone: DistanceZone | null;
  /** Out of Zone only, one decimal — the three nearer zones are a word. */
  distanceKm: number | null;
  feeMinor: number | null;
};

export type BasketTotals = {
  /**
   * What the client is charged for the items: GRIDGO's figure, fee inside,
   * exactly as the server writes the order. This is the Printing row.
   * Null while a line has no price.
   */
  clientItemSubtotalMinor: number | null;
  /** One leg per print run. Two runs is two drops and two fees. Empty on pick-up. */
  legs: DeliveryLeg[];
  /**
   * The pick-up fee on a basket that chose pick-up before matching. Already
   * inside `deliveryFeeMinor` — never add the two. Null on any other basket.
   */
  pickupFeeMinor: number | null;
  /** Every leg plus any pick-up fee. Null when a leg is still unpriced — a partial total is a lie. */
  deliveryFeeMinor: number | null;
  totalMinor: number | null;
  /**
   * The share taken up front — all of it on a paid-in-full plan — and what is
   * left for before delivery (zero when paid in full). Null while the total is.
   */
  downpaymentMinor: number | null;
  balanceMinor: number | null;
  /** The share GRIDGO takes up front. */
  downpaymentPercent: number;
  /** Why there is no total yet, as GRIDGO said it. Empty once priced. */
  reasons: CartQuote["reasons"];
};

export type TotalsInput = {
  cart: Cart | null;
  /** For the up-front share and an older payload's line markup only. */
  settings: PlatformSettings | null;
};

/**
 * What the client owes, as far as GRIDGO can honestly say: the basket's own
 * quote, with each delivery leg named by the run it carries.
 */
export function basketTotals({ cart, settings }: TotalsInput): BasketTotals {
  const lines = cart?.lines ?? [];
  const runs = printRuns(lines, settings?.serviceFeeRateBps);
  const quote = cart?.clientQuote;
  if (quote) {
    const runOf = (lineIds: string[]) =>
      runs.find((run) => run.lines.some((line) => lineIds.includes(line.id)))?.runLabel ?? "Print run";
    return {
      clientItemSubtotalMinor: quote.clientItemSubtotalMinor,
      legs: quote.deliveryLines.map((leg) => ({
        runLabel: runOf(leg.lineIds),
        lineIds: leg.lineIds,
        zone: leg.distanceZone,
        distanceKm: leg.distanceKm ?? null,
        feeMinor: leg.deliveryFeeMinor,
      })),
      pickupFeeMinor: quote.pickupFeeMinor ?? null,
      deliveryFeeMinor: quote.deliveryFeeMinor,
      totalMinor: quote.totalMinor,
      downpaymentMinor: quote.downpaymentMinor,
      balanceMinor: quote.balanceMinor,
      downpaymentPercent: quote.downpaymentPercent,
      reasons: quote.reasons,
    };
  }

  // An API from before the basket quote. Printing is still GRIDGO's line
  // figures; delivery is unknown rather than measured from a shop's pin.
  const clientItemSubtotalMinor = sumMinor(runs.map((run) => run.clientSubtotalMinor));
  const collecting = cart?.fulfillmentMode === "pickup";
  const deliveryFeeMinor = collecting ? 0 : null;
  const totalMinor =
    clientItemSubtotalMinor != null && deliveryFeeMinor != null ? clientItemSubtotalMinor + deliveryFeeMinor : null;
  const downpaymentPercent = settingsDownpaymentPercent(settings);
  const downpaymentMinor = totalMinor == null ? null : roundBps(totalMinor, downpaymentPercent * 100);
  return {
    clientItemSubtotalMinor,
    legs: [],
    pickupFeeMinor: null,
    deliveryFeeMinor,
    totalMinor,
    downpaymentMinor,
    balanceMinor: totalMinor == null || downpaymentMinor == null ? null : totalMinor - downpaymentMinor,
    downpaymentPercent,
    reasons: [],
  };
}

/**
 * Lines GRIDGO could not price — usually a quantity under the shop's minimum.
 * Read from GRIDGO's own figure; the shop's is on its way out of the payload.
 */
export function linesUnpriced(lines: CartLineRecord[]): CartLineRecord[] {
  return lines.filter((line) =>
    line.clientLineSubtotalMinor !== undefined ? line.clientLineSubtotalMinor == null : line.lineSubtotalMinor == null,
  );
}

/** Lines with neither a file nor a design link, so the sheet can name them. */
export function linesMissingArtwork(lines: CartLineRecord[]): CartLineRecord[] {
  return lines.filter((line) => !lineHasArtwork(line));
}

/** Lines with no drop-off, when the run is being delivered. */
export function linesMissingDropoff(cart: Cart | null): CartLineRecord[] {
  if (!cart || cart.fulfillmentMode !== "delivery") return [];
  return cart.lines.filter((line) => !(line.dropoff ?? cart.defaultDropoff));
}

/** What one basket line is called, from the listing it came from. */
export function lineName(line: CartLineRecord): string {
  return line.listing?.name ?? "This listing";
}

/** The options answered on a line, as the client picked them. */
export function lineOptionLabels(line: CartLineRecord): string[] {
  const listing = line.listing;
  if (!listing) return [];
  if (Array.isArray(listing.optionGroups)) {
    return line.optionIds
      .map((optionId) => {
        for (const group of listing.optionGroups) {
          const option = group.options.find((candidate) => candidate.id === optionId);
          if (option) return option.label;
        }
        return null;
      })
      .filter((label): label is string => Boolean(label));
  }
  const selected = (listing as { selectedOptions?: { id: string; label: string }[] }).selectedOptions;
  return Array.isArray(selected) ? selected.map((option) => option.label) : [];
}
