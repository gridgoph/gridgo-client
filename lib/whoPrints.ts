/**
 * "Who prints it?" (gridgo-client#449, report B26328C8; gridgo-api
 * `docs/EXPRESS_API.md`, "Who prints it? (B26328C8)"). Pure rules for the
 * Express printer choice: the fare limits for "Just print it", the sorts, the
 * widening notice, and how one printer card reads. Every fare, zone and price
 * is the server's (`POST /express/shops`); nothing here is a fee table.
 */

import {
  ApiError,
  formatPhp,
  type DeliveryFeeBand,
  type ExpressFareLimit,
  type ExpressPrinterSort,
  type ExpressPrintersRead,
  type ExpressShop,
} from "@/lib/api";
import type { ExpressFulfilment, ExpressPrint } from "@/lib/express";

/** The fare GRIDGO's `up_to_149` limit allows (gridgo-api's contract, in centavos). */
export const UP_TO_149_MINOR = 14_900;

/** The code GRIDGO refused with, wherever the error carries it. */
export function apiErrorCode(error: unknown): string | null {
  if (error instanceof ApiError) {
    const body = error.body as { error?: unknown } | null;
    if (body && typeof body === "object" && typeof body.error === "string") return body.error;
    return error.message || null;
  }
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

/**
 * An API without the printer choice: the route is missing (404 `not_found`
 * or 405). The screen then steps aside and the older shop sheet stays.
 */
export function printerChoiceMissing(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 405) return true;
  return error.status === 404 && ["not_found", "HTTP 404"].includes(error.message);
}

/** A3 is priced by each shop and paid after the shop accepts. */
export function usesShopPrices(prints: Pick<ExpressPrint, "paper">[]): boolean {
  return prints.some((print) => print.paper === "a3");
}

export function sortOptions(shopPrices: boolean): { value: ExpressPrinterSort; label: string }[] {
  return [
    { value: "nearby", label: "Nearby" },
    { value: "all_davao", label: "All Davao" },
    { value: "fastest", label: "Fastest" },
    { value: "top_rated", label: "Top rated" },
    ...(shopPrices ? [{ value: "lowest_price" as const, label: "Lowest price" }] : []),
  ];
}

/** "₱149" for whole pesos, so a fare limit fits its chip; centavos stay when there are any. */
export function chipPesos(minor: number): string {
  const full = formatPhp(minor);
  return minor % 100 === 0 ? full.replace(/\.00$/, "") : full;
}

function bandFor(bands: DeliveryFeeBand[], key: string): DeliveryFeeBand | undefined {
  return bands.find((band) => band.zone === key);
}

/** Zone words whose flat fare fits under a limit, in band order ("Nearby or Away"). */
function zonesWithin(bands: DeliveryFeeBand[], limitMinor: number): string[] {
  return bands
    .filter((band) => typeof band.feeMinor === "number" && band.feeMinor <= limitMinor && band.label)
    .map((band) => band.label as string);
}

function joinOr(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

export type FareLimitOption = { value: ExpressFareLimit; label: string; detail: string };

/**
 * The three choices under "Just print it". Delivery leads with the fare, since
 * that is what changes the total; pickup has no fare, so it says how far.
 */
export function fareLimitOptions(bands: DeliveryFeeBand[], fulfilment: ExpressFulfilment): FareLimitOption[] {
  const nearby = bandFor(bands, "nearby");
  const nearbyFee = typeof nearby?.feeMinor === "number" ? chipPesos(nearby.feeMinor) : null;
  const within = zonesWithin(bands, UP_TO_149_MINOR);
  const nearbyKm = typeof nearby?.maxDistanceMeters === "number" ? nearby.maxDistanceMeters / 1000 : null;
  const nearbyReach = nearbyKm ? `Within ${Number.isInteger(nearbyKm) ? nearbyKm : nearbyKm.toFixed(1)} km` : null;
  if (fulfilment === "delivery") {
    return [
      { value: "nearby", label: "Nearby", detail: nearbyFee ? `${nearbyFee} fare` : "Closest zone" },
      { value: "up_to_149", label: `Up to ${chipPesos(UP_TO_149_MINOR)}`, detail: within.length ? joinOr(within) : "Fare limit" },
      { value: "any", label: "Any", detail: "Any distance" },
    ];
  }
  return [
    { value: "nearby", label: "Nearby", detail: nearbyReach ?? "Closest zone" },
    { value: "up_to_149", label: "A bit farther", detail: within.length ? joinOr(within) : "Up to Away" },
    { value: "any", label: "Anywhere", detail: "Any distance" },
  ];
}

/**
 * The line under the sort chips when Nearby had to reach farther: says which
 * zones were added and what they cost, so a bigger fare is never a surprise.
 */
export function widenedLine(read: Pick<ExpressPrintersRead, "expandedZones" | "fareBands">, fulfilment: ExpressFulfilment): string | null {
  if (!read.expandedZones.length) return null;
  const keyFor: Record<string, string> = { B: "away", C: "long_distance" };
  const added = read.expandedZones
    .map((code) => bandFor(read.fareBands, keyFor[code] ?? ""))
    .filter((band): band is DeliveryFeeBand => Boolean(band?.label))
    .map((band) =>
      fulfilment === "delivery" && typeof band.feeMinor === "number"
        ? `${band.label} (${formatPhp(band.feeMinor)})`
        : (band.label as string),
    );
  const zones = added.length ? joinOr(added).replace(/ or /, " and ") : "farther zones";
  return `Fewer than 3 printers are open nearby, so ${zones} ${added.length === 1 ? "is" : "are"} shown too.`;
}

/** Open, night or closed — and "open, no delivery now" for an open shop outside rider hours. */
export function printerStatus(card: ExpressShop, fulfilment: ExpressFulfilment): { label: string; tone: "success" | "info" | "muted" } {
  if (card.openStatus === "closed" || card.isOpenNow === false) return { label: "Closed", tone: "muted" };
  if (card.selectable === false) {
    return { label: fulfilment === "delivery" ? "Open · no delivery now" : "Open · busy", tone: "muted" };
  }
  if (card.openStatus === "night") return { label: "Open tonight", tone: "info" };
  return { label: "Open now", tone: "success" };
}

/** "12 min walk", "1 h 5 min walk". An estimate, said as one. */
export function walkLine(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return null;
  const whole = Math.max(1, Math.round(minutes));
  if (whole < 60) return `About ${whole} min walk`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return `About ${hours} h${rest ? ` ${rest} min` : ""} walk`;
}

/** The zone as the client reads it: "Zone A · Nearby", or just the word when out of zone. */
export function zoneLine(card: ExpressShop): string | null {
  const zone = card.zone;
  if (!zone?.label) return null;
  return zone.code ? `Zone ${zone.code} · ${zone.label}` : zone.label;
}

/** What getting it costs or takes: the delivery fare, or the walk for pickup. */
export function reachLine(card: ExpressShop, fulfilment: ExpressFulfilment): string | null {
  if (fulfilment === "pickup") return walkLine(card.walkingTimeMinutes);
  const fee = card.deliveryFeeMinor ?? card.deliveryFareMinor;
  return typeof fee === "number" ? `${formatPhp(fee)} delivery` : null;
}

/** A3: this shop's own printing price, from its exact quote. Null for documents (same everywhere). */
export function shopPrintingPrice(card: ExpressShop): number | null {
  if (card.paymentTiming !== "after_acceptance") return null;
  const value = card.quote?.clientItemSubtotalMinor;
  return typeof value === "number" ? value : null;
}

/** Open, choosable cards first; the server already sorted within each half. */
export function selectableFirst(cards: ExpressShop[]): ExpressShop[] {
  return [...cards.filter((card) => card.selectable !== false), ...cards.filter((card) => card.selectable === false)];
}

/** "Lowest price" exists only for A3; drop it when the order no longer has A3. */
export function validSort(sort: ExpressPrinterSort, shopPrices: boolean): ExpressPrinterSort {
  return sort === "lowest_price" && !shopPrices ? "nearby" : sort;
}

/** What "Just print it" says when GRIDGO found nobody within the limit. */
export const NO_PRINTER_WITHIN_LIMIT = "No open printer fits that fare limit. Allow a farther one, or pick a printer below.";
export const A3_PICK_YOURSELF = "A3 is priced by each shop. Pick the printer and price you want below.";

/** "Pay within 4:59" — seconds left before an A3 payment window closes; null once it closed. */
export function payCountdown(payBy: string | null | undefined, now: number): { label: string; seconds: number } | null {
  if (!payBy) return null;
  const left = Date.parse(payBy) - now;
  if (!Number.isFinite(left) || left <= 0) return null;
  const seconds = Math.ceil(left / 1000);
  return { label: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, seconds };
}
