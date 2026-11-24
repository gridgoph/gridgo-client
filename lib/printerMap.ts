/**
 * The map on Express "Who prints it?" (gridgo-client#468, report C49D5A3E).
 *
 * Pure rules: which printers get a pin, how each pin reads, how far the chosen
 * fare limit reaches, and what the map says when nobody open fits it. The
 * printers are exactly the ones `POST /express/shops` returned for the list;
 * nothing here asks for more.
 *
 * A home printer never gets a pin. GRIDGO sends it with `location: null` and a
 * distance rounded up to 500 m, and a client learns its street only after a
 * paid pickup (`lib/homePrinter.ts`). The map counts homes and points at the
 * list, where each one reads by its barangay.
 */

import type { DeliveryFeeBand, ExpressFareLimit, ExpressShop } from "@/lib/api";
import type { ExpressFulfilment } from "@/lib/express";
import { homeDistanceLine, isHomePrinter } from "@/lib/homePrinter";
import { isGeoPoint, type GeoPoint } from "@/lib/tracking";
import { UP_TO_149_MINOR } from "@/lib/whoPrints";

/** One printer as the map page draws it. */
export type PrinterPin = {
  id: string;
  lat: number;
  lng: number;
  /** The shop's name: what the pin's caption and tooltip say. */
  name: string;
  /** "1.2 km". Straight line, as the list measures it. */
  distance: string;
  /** Open and choosable; a closed or busy printer is drawn hollow and cannot be picked. */
  open: boolean;
  /** The printer the client picked; drawn in the map's one highlight. */
  selected: boolean;
  /** Captioned with its distance: the nearest open ones when nothing fits the limit. */
  flagged: boolean;
};

/** How far the client's fare limit reaches, drawn as a ring round their place. */
export type PrinterReach = { meters: number; label: string };

/** How many pins the opening view frames round the client: enough to compare, not all of Davao. */
const FRAMED_NEAREST = 3;

/** "800 m", "1.2 km", "12 km". */
export function distanceLabel(meters: number | null | undefined): string | null {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return null;
  if (meters < 1000) return `${Math.max(100, Math.round(meters / 100) * 100)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1).replace(/\.0$/, "") : Math.round(km)} km`;
}

function pinnable(card: ExpressShop): card is ExpressShop & { location: GeoPoint } {
  return !isHomePrinter(card) && isGeoPoint(card.location);
}

export function isOpenPrinter(card: ExpressShop): boolean {
  return card.selectable !== false && card.isOpenNow !== false && card.openStatus !== "closed";
}

/** Open printers, nearest first. */
function nearestOpen(cards: ExpressShop[]): ExpressShop[] {
  return cards.filter(isOpenPrinter).sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * The ring for "Just print it": the farthest band its fare limit allows.
 * "Any" has no edge, and a picked printer has no limit at all, so both are null.
 */
export function fareReach(
  bands: DeliveryFeeBand[],
  fareLimit: ExpressFareLimit | null,
  fulfilment: ExpressFulfilment,
): PrinterReach | null {
  if (fareLimit == null || fareLimit === "any") return null;
  const allowed =
    fareLimit === "nearby"
      ? bands.filter((band) => band.zone === "nearby")
      : bands.filter((band) => typeof band.feeMinor === "number" && band.feeMinor <= UP_TO_149_MINOR);
  const meters = Math.max(0, ...allowed.map((band) => band.maxDistanceMeters ?? 0));
  if (!meters) return null;
  const words = fareLimit === "nearby" ? "Nearby" : fulfilment === "delivery" ? "Up to ₱149" : "A bit farther";
  return { meters, label: `${words} · ${distanceLabel(meters)}` };
}

/**
 * True when "Just print it" found nobody open inside its limit: the draft was
 * refused for it. The map then opens on the nearest open printers.
 */
export function nothingFits(input: { fareLimit: ExpressFareLimit | null; draftCode: string | null }): boolean {
  return input.fareLimit != null && input.fareLimit !== "any" && input.draftCode === "express_shop_unavailable";
}

/** The pins, and which of them the opening view should frame. */
export function printerPins(
  cards: ExpressShop[],
  input: { supplierId: string | null; fareLimit: ExpressFareLimit | null; noFit: boolean },
): { pins: PrinterPin[]; frame: string[] } {
  const open = nearestOpen(cards.filter(pinnable));
  const near = open.slice(0, FRAMED_NEAREST).map((card) => card.supplierId);
  const pins = cards.filter(pinnable).map((card) => ({
    id: card.supplierId,
    lat: card.location.lat,
    lng: card.location.lng,
    name: card.name,
    distance: distanceLabel(card.distanceMeters) ?? "",
    open: isOpenPrinter(card),
    selected: input.fareLimit == null && card.supplierId === input.supplierId,
    flagged: input.noFit && near.includes(card.supplierId),
  }));
  // A picked printer stays in view; otherwise the nearest open ones, or the nearest of any.
  const fallback = [...cards.filter(pinnable)].sort((a, b) => a.distanceMeters - b.distanceMeters);
  const frame = near.length ? near : fallback.slice(0, FRAMED_NEAREST).map((card) => card.supplierId);
  const chosen = pins.find((pin) => pin.selected);
  return { pins, frame: chosen && !frame.includes(chosen.id) ? [...frame, chosen.id] : frame };
}

function joinAnd(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * What the map says when nothing open fits the limit, so "allow a farther one"
 * is a choice made with the distance in front of the client.
 */
export function noFitLine(cards: ExpressShop[]): string {
  const open = nearestOpen(cards);
  if (!open.length) return "No printer is open right now. Closed ones are shown so you can see where they are.";
  const near = open.slice(0, 2);
  const distances = near.map((card) => (isHomePrinter(card) ? homeDistanceLine(card.distanceMeters) : distanceLabel(card.distanceMeters)));
  const said = joinAnd(distances.filter((value): value is string => Boolean(value)).map((value) => value.replace(/^Within /, "within ")));
  const subject = near.length === 1 ? "The nearest open printer is" : "The nearest open printers are";
  return `${subject} ${said} away, past your limit. Allow a farther one, or tap a pin to pick it.`;
}

/** The map's one-line count: "4 shops · 1 home printer". */
export function mapCountLine(cards: ExpressShop[]): string {
  const homes = cards.filter(isHomePrinter).length;
  const shops = cards.length - homes;
  const parts = [shops ? `${shops} shop${shops === 1 ? "" : "s"}` : null, homes ? `${homes} home printer${homes === 1 ? "" : "s"}` : null];
  return parts.filter(Boolean).join(" · ") || "No printers yet";
}

/** Said once under the map when home printers are in the list but not on it. */
export function homesOffMapLine(cards: ExpressShop[]): string | null {
  const homes = cards.filter(isHomePrinter).length;
  if (!homes) return null;
  return homes === 1
    ? "The home printer isn't pinned, to keep the home private. It's in the list with its barangay."
    : `The ${homes} home printers aren't pinned, to keep homes private. They're in the list with their barangays.`;
}

/** What a tap on a pin that cannot be picked says. */
export function unavailableLine(card: ExpressShop, fulfilment: ExpressFulfilment): string {
  if (card.openStatus === "closed" || card.isOpenNow === false) return `${card.name} is closed now. Pick an open printer.`;
  return fulfilment === "delivery"
    ? `${card.name} is open but can't deliver now. Pick another printer, or pick up.`
    : `${card.name} is too busy for a new job now. Pick another printer.`;
}

/** The map's first view on a short phone is folded, so the list and Continue stay in reach. */
export const MAP_OPEN_MIN_WINDOW_HEIGHT = 760;
