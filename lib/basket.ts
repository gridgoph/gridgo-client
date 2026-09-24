/**
 * What the basket comes to, before GRIDGO writes the order.
 *
 * Checkout is the authority: `POST /me/carts/:id/checkout` groups the lines by
 * shop, measures each shop's farthest drop-off, prices delivery from the
 * distance bands, adds the service fee, and returns the figures the order is
 * written with. This module reproduces that arithmetic so the sheet can show a
 * total before the client commits to it — the same formulas, from the same
 * `GET /settings`, so the preview and the invoice agree.
 *
 * Where GRIDGO cannot yet know a figure, neither can this. No drop-off means
 * no delivery leg and no total, and the sheet says so rather than showing a
 * number that will move.
 *
 * The grouping is by supplier because that is what the money does — one press
 * is one print run, one drop and one delivery charge — but nothing here carries
 * a shop's name. The client is buying from GRIDGO; a run is "Print run 1", and
 * the supplier id stays where it belongs, in the calls.
 */

import type { Cart, CartLineRecord, PlatformSettings } from "@/lib/api";
import { clientAmountMinor, roundBps } from "@/lib/gridgoPrice";
import { haversineMetres, type GeoPoint } from "@/lib/tracking";

export { roundBps } from "@/lib/gridgoPrice";

/** The band a distance falls in. Bands are ordered, and the last has no max. */
export function deliveryFeeForDistance(
  settings: Pick<PlatformSettings, "deliveryFeeBands">,
  metres: number,
): number | null {
  for (const band of settings.deliveryFeeBands) {
    if (band.maxDistanceMeters == null || metres <= band.maxDistanceMeters) {
      return band.feeMinor;
    }
  }
  return null;
}

export type PrintRun = {
  supplierId: string;
  /** What the client calls this run. Never a shop. */
  runLabel: string;
  lines: CartLineRecord[];
  /**
   * The shop's figure for the run, or null while any line in it has none.
   * GRIDGO answers `lineSubtotalMinor: null` for a line its pricer refused;
   * counting that as zero is what showed a lanyard at PHP 0.00.
   */
  subtotalMinor: number | null;
  /** GRIDGO sum for this run, or null while any line in it has none. */
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
 * What a client-facing surface shows for one basket line.
 *
 * Prefer the API's `clientLineSubtotalMinor` when it is a safe integer.
 * Otherwise apply `clientAmountMinor` — the same half-up markup listing
 * already uses. A null shop line is not yet priced.
 */
export function clientLineAmountMinor(
  line: Pick<CartLineRecord, "lineSubtotalMinor" | "clientLineSubtotalMinor">,
  serviceFeeRateBps: number,
): number | null {
  if (Number.isSafeInteger(line.clientLineSubtotalMinor)) {
    return line.clientLineSubtotalMinor as number;
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
export function printRuns(lines: CartLineRecord[], serviceFeeRateBps = 0): PrintRun[] {
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
    subtotalMinor: sumMinor(runLines.map((line) => line.lineSubtotalMinor)),
    clientSubtotalMinor: sumMinor(
      runLines.map((line) => clientLineAmountMinor(line, serviceFeeRateBps)),
    ),
  }));
}

export type DeliveryLeg = {
  supplierId: string;
  runLabel: string;
  /** To the farthest drop-off this run has to reach, which is what is charged. */
  distanceMeters: number | null;
  feeMinor: number | null;
};

export type BasketTotals = {
  /** The shops' own figure for the items. Null while any line has no price. */
  itemSubtotalMinor: number | null;
  serviceFeeRateBps: number;
  serviceFeeMinor: number;
  /**
   * What the client is charged for the items: the shops' figure plus GRIDGO's
   * charge, exactly as the server writes the order. This is the Items row —
   * a client buys from GRIDGO, and there is no fee row for them to add up.
   * Null while a line has no price or the platform's rate is unread.
   */
  gridgoItemsMinor: number | null;
  /**
   * Same figure as `gridgoItemsMinor`. Checkout and receipt read this name
   * for GRIDGO printing; keep both so older tests and the sheet agree.
   */
  clientItemSubtotalMinor: number | null;
  /** One leg per print run. Two runs is two drops and two fees. */
  legs: DeliveryLeg[];
  /** Null when any leg is still unpriced — a partial delivery total is a lie. */
  deliveryFeeMinor: number | null;
  totalMinor: number | null;
  /** 75% now, the rest before delivery. Null while the total is. */
  downpaymentMinor: number | null;
  balanceMinor: number | null;
};

/** The share of the total GRIDGO collects up front, per the money model. */
export const DOWNPAYMENT_RATE_BPS = 7500;

export type TotalsInput = {
  cart: Cart | null;
  settings: PlatformSettings | null;
  /** Where each run starts, so its leg can be measured. Never rendered. */
  shopPoints: Record<string, GeoPoint | null>;
};

/**
 * What the client owes, as far as GRIDGO can honestly say.
 *
 * Delivery is measured to the farthest drop-off each run has to reach — the
 * same rule checkout applies — so a run split across three addresses is priced
 * on the longest leg and not on the nearest.
 */
export function basketTotals({ cart, settings, shopPoints }: TotalsInput): BasketTotals {
  const lines = cart?.lines ?? [];
  const serviceFeeRateBps = settings?.serviceFeeRateBps ?? 0;
  const groups = printRuns(lines, serviceFeeRateBps);
  const itemSubtotalMinor = sumMinor(groups.map((group) => group.subtotalMinor));
  const serviceFeeMinor =
    settings && itemSubtotalMinor != null ? roundBps(itemSubtotalMinor, serviceFeeRateBps) : 0;
  const gridgoItemsMinor =
    clientAmountMinor(itemSubtotalMinor, settings?.serviceFeeRateBps);
  const clientItemSubtotalMinor = gridgoItemsMinor;

  const collecting = cart?.fulfillmentMode === "pickup";
  const legs: DeliveryLeg[] = collecting
    ? []
    : groups.map((group) => {
        const shopPoint = shopPoints[group.supplierId] ?? null;
        const dropoffs = group.lines.map((line) => line.dropoff ?? cart?.defaultDropoff ?? null);
        const distances = shopPoint
          ? dropoffs.map((dropoff) =>
              dropoff ? Math.round(haversineMetres(shopPoint, dropoff)) : null,
            )
          : dropoffs.map(() => null);
        const known = distances.every((distance) => distance != null) && distances.length > 0;
        // Checkout charges the farthest drop this run has to reach.
        const distanceMeters = known ? Math.max(...(distances as number[])) : null;
        return {
          supplierId: group.supplierId,
          runLabel: group.runLabel,
          distanceMeters,
          feeMinor:
            settings && distanceMeters != null
              ? deliveryFeeForDistance(settings, distanceMeters)
              : null,
        };
      });

  const deliveryKnown = legs.every((leg) => leg.feeMinor != null);
  const deliveryFeeMinor = deliveryKnown
    ? legs.reduce((sum, leg) => sum + (leg.feeMinor ?? 0), 0)
    : null;

  const totalMinor =
    gridgoItemsMinor != null && deliveryFeeMinor != null
      ? gridgoItemsMinor + deliveryFeeMinor
      : null;
  const downpaymentMinor = totalMinor == null ? null : roundBps(totalMinor, DOWNPAYMENT_RATE_BPS);

  return {
    itemSubtotalMinor,
    serviceFeeRateBps,
    serviceFeeMinor,
    gridgoItemsMinor,
    clientItemSubtotalMinor,
    legs,
    deliveryFeeMinor,
    totalMinor,
    downpaymentMinor,
    balanceMinor:
      totalMinor == null || downpaymentMinor == null ? null : totalMinor - downpaymentMinor,
  };
}

/** Lines GRIDGO could not price — usually a quantity under the shop's minimum. */
export function linesUnpriced(lines: CartLineRecord[]): CartLineRecord[] {
  return lines.filter((line) => line.lineSubtotalMinor == null);
}

/** Lines still waiting for a file, so the sheet can name them. */
export function linesMissingArtwork(lines: CartLineRecord[]): CartLineRecord[] {
  return lines.filter((line) => !line.artworkFileId);
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
