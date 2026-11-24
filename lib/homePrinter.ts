/**
 * Home printers (gridgoph/gridgo-api#412, report 0B10F8DE; gridgo-api
 * `docs/HOME_PRINTERS_API.md`). People who print documents from home, mostly
 * at night. A client only ever learns the barangay and a distance rounded up
 * to 500 m; a paid home pickup adds the street and nothing more. The exact pin,
 * the person's name and the landmark never reach this app, and nothing here
 * tries to rebuild them. Shops read exactly as before.
 */

import { isGeoPoint } from "@/lib/tracking";

type Printer = { printerType?: string | null; barangay?: string | null; name?: string | null };

export function isHomePrinter(printer: Printer | null | undefined): boolean {
  return printer?.printerType === "home";
}

/**
 * "Within 1.5 km". GRIDGO rounds a home's distance up to the next 500 m, so
 * the honest reading is an upper bound, never "1.5 km away".
 */
export function homeDistanceLine(meters: number | null | undefined): string | null {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return null;
  const rounded = Math.max(500, Math.ceil(meters / 500) * 500);
  if (rounded < 1000) return `Within ${rounded} m`;
  const km = rounded / 1000;
  return `Within ${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

/** The barangay a home printer is in; GRIDGO names a home by it. */
export function homeBarangay(printer: Printer | null | undefined): string | null {
  const value = printer?.barangay ?? printer?.name ?? null;
  return value && value.trim() ? value.trim() : null;
}

/** "Home printer in Matina Crossing" for a home, the shop's own name otherwise. */
export function printerName(printer: Printer | null | undefined): string | null {
  if (!printer) return null;
  if (!isHomePrinter(printer)) return printer.name ?? null;
  const barangay = homeBarangay(printer);
  return barangay ? `Home printer in ${barangay}` : "Home printer";
}

/**
 * How a sentence names a home: "the home printer in Matina Crossing", or "a
 * home printer in …" for GRIDGO's own pick. A shop keeps its name.
 */
export function printerPhrase(printer: Printer | null | undefined, article: "the" | "a" = "the"): string | null {
  const name = printerName(printer);
  if (!name || !isHomePrinter(printer)) return name;
  return `${article} ${name[0].toLowerCase()}${name.slice(1)}`;
}

/** Said before paying for a pickup at someone's home, so the missing street is expected. */
export const HOME_PICKUP_BEFORE_PAYMENT =
  "This printer works from home. You'll see the street once your payment is confirmed. The exact spot stays private.";

/** On the order while the street is still held back. */
export const HOME_PICKUP_STREET_PENDING = "The street shows here once your payment is confirmed.";

export type HomePickupPlace = { barangay: string | null; street: string | null };

/**
 * Where a home pickup is, as far as GRIDGO tells this client: the barangay,
 * and the street once both payments are settled. Coordinates are ignored even
 * if a payload ever carried them.
 */
export function homePickupPlace(pickup: unknown, fallbackBarangay: string | null = null): HomePickupPlace {
  const value = pickup && typeof pickup === "object" ? (pickup as { barangay?: unknown; street?: unknown }) : {};
  const text = (field: unknown) => (typeof field === "string" && field.trim() ? field.trim() : null);
  return { barangay: text(value.barangay) ?? fallbackBarangay, street: text(value.street) };
}

/** A pin worth mapping: never one for a home printer. */
export function mappablePickup<T>(pickup: T, home: boolean): (T & { lat: number; lng: number }) | null {
  if (home || !isGeoPoint(pickup)) return null;
  return pickup as T & { lat: number; lng: number };
}
