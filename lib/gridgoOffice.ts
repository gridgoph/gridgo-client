/**
 * GRIDGO's own counter in Davao — the one place a client ever collects from.
 *
 * GRIDGO is the storefront. A print job is run behind that counter by a partner
 * press the client never has to know about, and a GRIDGO rider brings the
 * finished job here. So "pickup" means this address and nothing else: never a
 * partner's shop, never two addresses because a basket was split across two
 * print runs.
 *
 * One owner for the pin, on purpose. The coordinates were given by the captain
 * against a Google Maps link and are not derived from anything the API sends,
 * so a second copy anywhere in the app is a second thing to get wrong.
 */

import type { GeoPoint } from "@/lib/tracking";

/** The collect-at point, exactly as a map wants it. */
export const GRIDGO_OFFICE: GeoPoint & { label: string; locality: string } = {
  lat: 7.092287234449552,
  lng: 125.61651084538697,
  label: "GRIDGO Office",
  locality: "Poblacion District, Davao City",
};

/** What the office is called anywhere words are needed rather than a pin. */
export const GRIDGO_OFFICE_LABEL = GRIDGO_OFFICE.label;

/** The pin as six-decimal lat, lng — what the collect card prints. */
export function gridgoOfficeCoordLine(): string {
  return `${GRIDGO_OFFICE.lat.toFixed(6)}, ${GRIDGO_OFFICE.lng.toFixed(6)}`;
}

/**
 * One line saying how a collected job gets here.
 *
 * The rider leg is the part clients do not expect — they assume "pickup" means
 * going to whoever printed it — so it is said rather than implied.
 */
export const GRIDGO_OFFICE_BLURB =
  "GRIDGO's rider brings your finished job to the office. You collect it at the counter.";

/**
 * The pin on Google Maps, built from the coordinates rather than a short link.
 *
 * A `maps.app.goo.gl` link is a redirect somebody else owns; the coordinates
 * are the fact. This is the universal cross-platform form, so it opens the
 * Maps app where there is one and the web map where there is not.
 */
export function gridgoOfficeMapUrl(): string {
  return `https://www.google.com/maps/search/?api=1&query=${GRIDGO_OFFICE.lat},${GRIDGO_OFFICE.lng}`;
}
