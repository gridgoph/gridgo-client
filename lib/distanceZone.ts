/**
 * Distance, said as a word (gridgoph/gridgo-client#156).
 *
 * A figure like "2.3 km away" locates a shop, and the shop is GRIDGO's
 * business rather than the client's. So distance reaches a client as one of
 * four zones — Nearby, Away, Long Distance, Out of Zone — from the same
 * `settings.deliveryFeeBands` table that prices delivery. One table, so the
 * word and the fee can never disagree.
 *
 * On matching, the API sends the word (`distanceZone`) and nothing else; the
 * app never measures a shop from its pin to fill a gap. Only an Out of Zone
 * listing carries `distanceKm`: past 15 km a figure no longer gives the shop
 * away, and the client is about to pay for every kilometre of it.
 *
 * The fee preview here is the server's arithmetic (gridgo-api
 * `deliveryFeeForDistance`): inclusive band limits on whole metres, a flat fee
 * for the first three zones, and for Out of Zone a base fee plus a fee for
 * every *started* kilometre of the whole distance. It is always priced from
 * metres — never from the rounded display `distanceKm`.
 */

import type {
  CatalogItem,
  DeliveryFeeBand,
  DistanceZone,
  PlatformSettings,
  ShopRating,
} from "@/lib/api";
import { formatPhp } from "@/lib/api";

export const OUT_OF_ZONE = "out_of_zone";

/** The band a distance falls in. Bands are ordered, and the last has no max. */
export function deliveryBandForDistance(
  settings: Pick<PlatformSettings, "deliveryFeeBands">,
  metres: number,
): DeliveryFeeBand | null {
  if (!Number.isFinite(metres) || metres < 0) return null;
  return (
    settings.deliveryFeeBands.find(
      (band) => band.maxDistanceMeters == null || metres <= band.maxDistanceMeters,
    ) ?? null
  );
}

/** Whether a band is priced per kilometre rather than flat. */
function perKmBand(band: DeliveryFeeBand): band is DeliveryFeeBand & {
  baseFeeMinor: number;
  perKmMinor: number;
} {
  return typeof band.baseFeeMinor === "number" && typeof band.perKmMinor === "number";
}

/** Kilometres charged for: every started one, over the whole distance. */
export function chargedKilometres(metres: number): number {
  return Math.ceil(metres / 1000);
}

/**
 * What delivery over this many metres costs, or null when GRIDGO has no band
 * for it. Out of Zone is `baseFeeMinor + perKmMinor × ceil(metres / 1000)`.
 */
export function deliveryFeeForDistance(
  settings: Pick<PlatformSettings, "deliveryFeeBands">,
  metres: number,
): number | null {
  const band = deliveryBandForDistance(settings, metres);
  if (!band) return null;
  if (perKmBand(band)) return band.baseFeeMinor + band.perKmMinor * chargedKilometres(metres);
  return typeof band.feeMinor === "number" ? band.feeMinor : null;
}

/** The zone word for a distance, or null on an API that has not named its bands. */
export function zoneForDistance(
  settings: Pick<PlatformSettings, "deliveryFeeBands">,
  metres: number,
): DistanceZone | null {
  const band = deliveryBandForDistance(settings, metres);
  return band?.zone && band.label ? { key: band.zone, label: band.label } : null;
}

export function isOutOfZone(zone: DistanceZone | null | undefined): boolean {
  return zone?.key === OUT_OF_ZONE;
}

/** "16.0 km" — one decimal, always, so 16 reads as a measurement. */
export function formatKm(km: number): string {
  return `${km.toFixed(1)} km`;
}

/**
 * The zone as a listing shows it: the word, and kilometres only when the API
 * sent them, which it does on Out of Zone listings alone. Null with no zone.
 */
export function zoneLine(
  zone: DistanceZone | null | undefined,
  distanceKm?: number | null,
): string | null {
  if (!zone?.label) return null;
  if (isOutOfZone(zone) && typeof distanceKm === "number" && Number.isFinite(distanceKm)) {
    return `${zone.label} · ${formatKm(distanceKm)}`;
  }
  return zone.label;
}

/**
 * A checkout delivery leg's zone: the word, and kilometres only when it is
 * Out of Zone. The metres are checkout's own measure, used for the price; the
 * figure shown is that measure to one decimal, the way the API shows it.
 */
export function legZoneLine(
  zone: DistanceZone | null | undefined,
  distanceMeters: number | null,
): string | null {
  return zoneLine(zone, distanceMeters == null ? null : distanceMeters / 1000);
}

/** A listing's own zone line. */
export function listingZoneLine(
  item: Pick<CatalogItem, "distanceZone" | "distanceKm">,
): string | null {
  return zoneLine(item.distanceZone, item.distanceKm);
}

/**
 * The rating as drawn beside a star: "4.6 (12)". Null when the API sent none,
 * which means the shop has fewer than five reviews — never draw a zero.
 */
export function ratingLine(rating: ShopRating | null | undefined): string | null {
  if (!rating || !Number.isFinite(rating.average) || !(rating.count > 0)) return null;
  return `${rating.average.toFixed(1)} (${rating.count})`;
}

/** The same rating, as a screen reader should say it. */
export function ratingLabel(rating: ShopRating | null | undefined): string | null {
  if (!ratingLine(rating) || !rating) return null;
  return `Rated ${rating.average.toFixed(1)} out of 5 from ${rating.count} ${
    rating.count === 1 ? "review" : "reviews"
  }`;
}

/** "5 km" — a band limit as a person says it. */
function limitKm(metres: number): string {
  const km = metres / 1000;
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

/** The Out of Zone rate in words: "₱75 + ₱10 per km". Null when unpriced. */
export function perKmRateLine(band: DeliveryFeeBand | null | undefined): string | null {
  if (!band || !perKmBand(band)) return null;
  return `${formatPhp(band.baseFeeMinor)} + ${formatPhp(band.perKmMinor)} per km`;
}

/** The Out of Zone band, wherever Operations has put its price. */
export function outOfZoneBand(
  settings: Pick<PlatformSettings, "deliveryFeeBands"> | null | undefined,
): DeliveryFeeBand | null {
  return settings?.deliveryFeeBands.find((band) => band.zone === OUT_OF_ZONE) ?? null;
}

export type ZoneRow = {
  key: string;
  label: string;
  /** "Up to 5 km", "5–10 km", "Over 15 km". */
  range: string;
  /** "₱25", or "₱75 + ₱10 per km". */
  price: string;
  outOfZone: boolean;
};

/**
 * The zone table as the delivery help lists it, from live settings. Empty on
 * an API whose bands carry no names, so the help says nothing rather than
 * guessing at words GRIDGO has not published.
 */
export function deliveryZoneRows(
  settings: Pick<PlatformSettings, "deliveryFeeBands"> | null | undefined,
): ZoneRow[] {
  const bands = settings?.deliveryFeeBands ?? [];
  if (!bands.length || bands.some((band) => !band.zone || !band.label)) return [];
  let previous: number | null = null;
  return bands.map((band) => {
    const max = band.maxDistanceMeters;
    const range =
      max == null
        ? `Over ${limitKm(previous ?? 0)}`
        : previous == null
          ? `Up to ${limitKm(max)}`
          : `${limitKm(previous).replace(" km", "")}–${limitKm(max)}`;
    previous = max ?? previous;
    const price = perKmBand(band)
      ? (perKmRateLine(band) as string)
      : typeof band.feeMinor === "number"
        ? formatPhp(band.feeMinor)
        : "Set by GRIDGO";
    return {
      key: band.zone as string,
      label: band.label as string,
      range,
      price,
      outOfZone: band.zone === OUT_OF_ZONE,
    };
  });
}

/** The warning a client reads before choosing an Out of Zone listing. */
export const OUT_OF_ZONE_QUESTION = "This shop is outside GRIDGO's delivery zones";

export function outOfZoneWarning({
  distanceKm,
  settings,
}: {
  distanceKm?: number | null;
  settings: Pick<PlatformSettings, "deliveryFeeBands"> | null | undefined;
}): string {
  const where =
    typeof distanceKm === "number" && Number.isFinite(distanceKm)
      ? `It is ${formatKm(distanceKm)} from your drop-off. `
      : "";
  const rate = perKmRateLine(outOfZoneBand(settings));
  const how = rate
    ? `Delivery from here is a base fee plus a fee for every kilometre (${rate}), so it can cost a lot more than usual.`
    : "Delivery from here is a base fee plus a fee for every kilometre, so it can cost a lot more than usual.";
  return `${where}${how} You can still choose it, or pick another listing.`;
}
