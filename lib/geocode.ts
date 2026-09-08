/**
 * Nominatim (OpenStreetMap) search and reverse-geocode for a Davao drop-off.
 *
 * Same OSM/Leaflet/CARTO stack as `lib/mapHtml.ts`. Google Maps / Places is
 * a separate captain call — this file must not grow a second provider.
 *
 * Nominatim's usage policy is one request per second and a real User-Agent.
 * Callers debounce the search field; this module serialises the network so
 * two in-flight lookups cannot stampede the public endpoint.
 */

import { DELIVERY_CITY } from "@/lib/address";
import type { GeoPoint } from "@/lib/tracking";

export const SEARCH_DEBOUNCE_MS = 400;
export const NOMINATIM_MIN_INTERVAL_MS = 1100;

/**
 * Davao City, as a viewbox Nominatim can bound.
 *
 * `viewbox` is left,top,right,bottom = west,north,east,south. Tight enough
 * that a search for a Manila street does not pin, loose enough that Toril
 * and Bunawan still match.
 */
export const DAVAO_VIEWBOX = {
  west: 125.32,
  south: 6.98,
  east: 125.75,
  north: 7.36,
} as const;

export const OUTSIDE_DAVAO =
  "GRIDGO only delivers inside Davao City. Search a place in Davao, or tap the map.";

export const GEOCODE_FAILED =
  "Could not look that place up. Search again, or tap the map.";

export const STREET_UNREAD =
  "Could not read the street here. Type it, or search.";

export const READING_PLACE = "Reading this place…";

const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

export type NominatimAddress = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  municipality?: string;
  city_district?: string;
  county?: string;
  state?: string;
  building?: string;
  amenity?: string;
  shop?: string;
  tourism?: string;
  office?: string;
};

export type NominatimHit = {
  place_id?: number | string;
  lat?: string | number;
  lon?: string | number;
  display_name?: string;
  name?: string;
  address?: NominatimAddress;
};

export type DropoffSuggestion = {
  id: string;
  /** Row title in the search list — a named place, or the street. */
  label: string;
  line1: string;
  landmark: string;
  /**
   * Quiet caption under the pin — house + road + suburb + Davao City when
   * OSM has them, else a display_name trimmed at the city. Never dumped
   * into the search box.
   */
  completeAddress?: string;
  point: GeoPoint;
};

export type GeocodeOk = { status: "ok"; suggestion: DropoffSuggestion };
export type GeocodeMiss =
  | { status: "outside_davao"; message: string }
  | { status: "empty"; message: string }
  | { status: "failed"; message: string };
export type GeocodeResult = GeocodeOk | GeocodeMiss;
export type SearchResult =
  | { status: "ok"; suggestions: DropoffSuggestion[] }
  | GeocodeMiss;

export function nominatimUserAgent(version: string): string {
  const ver = version.trim() || "1.0.0";
  return `GRIDGO-client/${ver}`;
}

export function pointInDavao(point: GeoPoint): boolean {
  return (
    point.lat >= DAVAO_VIEWBOX.south &&
    point.lat <= DAVAO_VIEWBOX.north &&
    point.lng >= DAVAO_VIEWBOX.west &&
    point.lng <= DAVAO_VIEWBOX.east
  );
}

/**
 * A Nominatim hit is in Davao City when the address says so, or — when the
 * city name is missing — when the point sits inside the city viewbox.
 *
 * Another Davao province town (Digos, Tagum, Panabo) is refused even if a
 * sloppy viewbox would have let it through.
 */
export function isDavaoCityHit(hit: NominatimHit, point: GeoPoint): boolean {
  const addr = hit.address;
  const named = [
    addr?.city,
    addr?.town,
    addr?.municipality,
    addr?.city_district,
    addr?.county,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (named) {
    if (named.includes("davao city")) return true;
    // A different city named in the hit is not Davao, even inside the box.
    if (/\b(digos|tagum|panabo|samal|mala|malalag|padada|hagonoy|bansalan|mati)\b/.test(named)) {
      return false;
    }
  }

  if (typeof hit.display_name === "string" && /davao city/i.test(hit.display_name)) {
    return true;
  }

  return !named && pointInDavao(point);
}

function firstText(...values: (string | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/**
 * Street line a rider can use: house number + road, else a building, else
 * the named place on a road. Barangay is not required and is not written.
 */
export function line1FromNominatim(hit: NominatimHit): string {
  const addr = hit.address ?? {};
  const road = firstText(addr.road, addr.pedestrian, addr.footway);
  const house = firstText(addr.house_number);
  const building = firstText(addr.building);
  if (road && house) return `${house} ${road}`;
  if (building && road) return `${building}, ${road}`;
  if (building) return building;

  const named = firstText(hit.name, addr.amenity, addr.shop, addr.tourism, addr.office);
  if (named && road) return `${named}, ${road}`;
  if (road) return road;
  if (named) return named;
  // A suburb or barangay is not a street. Reverse must not invent line1.
  return "";
}

/**
 * Complete address a client can read under the pin. Prefers Nominatim's
 * `display_name` cut at Davao City; otherwise house + road + suburb + city.
 * Never invents a house number.
 */
export function completeAddressFromNominatim(hit: NominatimHit): string {
  const display = typeof hit.display_name === "string" ? hit.display_name.trim() : "";
  if (display) {
    const cut = display.match(/^(.*?\bDavao City\b)/i);
    if (cut?.[1]) return cut[1].trim();
  }

  const addr = hit.address ?? {};
  const road = firstText(addr.road, addr.pedestrian, addr.footway);
  const house = firstText(addr.house_number);
  const street = house && road ? `${house} ${road}` : firstText(road, addr.building);
  if (!street) return "";
  const suburb = firstText(addr.suburb);
  return [street, suburb, DELIVERY_CITY].filter(Boolean).join(", ");
}

export function landmarkFromNominatim(hit: NominatimHit, line1: string): string {
  const addr = hit.address ?? {};
  const named = firstText(hit.name, addr.amenity, addr.shop, addr.tourism, addr.office, addr.building);
  if (!named) return "";
  if (line1.toLowerCase().includes(named.toLowerCase())) return "";
  return named;
}

export function pointFromNominatim(hit: NominatimHit): GeoPoint | null {
  const lat = typeof hit.lat === "number" ? hit.lat : Number.parseFloat(String(hit.lat ?? ""));
  const lng = typeof hit.lon === "number" ? hit.lon : Number.parseFloat(String(hit.lon ?? ""));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function suggestionFromNominatim(hit: NominatimHit): GeocodeResult {
  const point = pointFromNominatim(hit);
  if (!point) return { status: "failed", message: GEOCODE_FAILED };
  if (!isDavaoCityHit(hit, point) || !pointInDavao(point)) {
    return { status: "outside_davao", message: OUTSIDE_DAVAO };
  }

  const line1 = line1FromNominatim(hit);
  if (!line1) {
    return { status: "empty", message: STREET_UNREAD };
  }

  const landmark = landmarkFromNominatim(hit, line1);
  const label = firstText(hit.name, line1);
  const completeAddress = completeAddressFromNominatim(hit);
  return {
    status: "ok",
    suggestion: {
      id: String(hit.place_id ?? `${point.lat},${point.lng}`),
      label,
      line1,
      landmark,
      completeAddress,
      point,
    },
  };
}

export function viewboxQuery(): string {
  const { west, north, east, south } = DAVAO_VIEWBOX;
  return `${west},${north},${east},${south}`;
}

type NominatimFetch = typeof fetch;

let minIntervalMs = NOMINATIM_MIN_INTERVAL_MS;
let nextAllowedAt = 0;
let queue: Promise<void> = Promise.resolve();

/** Tests set this to 0 so two mocked lookups do not wait a second. */
export function setNominatimMinInterval(ms: number): void {
  minIntervalMs = Math.max(0, ms);
  nextAllowedAt = 0;
}

async function throttle(): Promise<void> {
  const wait = Math.max(0, nextAllowedAt - Date.now());
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  nextAllowedAt = Date.now() + minIntervalMs;
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    await throttle();
    return work();
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function nominatimHeaders(version: string): Record<string, string> {
  return {
    Accept: "application/json",
    "User-Agent": nominatimUserAgent(version),
  };
}

async function nominatimGet(
  url: string,
  version: string,
  fetchImpl: NominatimFetch,
): Promise<unknown> {
  const response = await fetchImpl(url, { headers: nominatimHeaders(version) });
  if (!response.ok) {
    throw new Error(`Nominatim ${response.status}`);
  }
  return response.json();
}

export async function searchNominatim(
  query: string,
  version: string,
  fetchImpl: NominatimFetch = fetch,
): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { status: "empty", message: "Type a place in Davao City." };

  try {
    const url =
      `${NOMINATIM_SEARCH}?format=jsonv2&addressdetails=1&limit=5` +
      `&countrycodes=ph&bounded=1&viewbox=${encodeURIComponent(viewboxQuery())}` +
      `&q=${encodeURIComponent(q)}`;
    const body = await enqueue(() => nominatimGet(url, version, fetchImpl));
    if (!Array.isArray(body)) return { status: "failed", message: GEOCODE_FAILED };

    const suggestions: DropoffSuggestion[] = [];
    let sawOutside = false;
    for (const raw of body) {
      const mapped = suggestionFromNominatim(raw as NominatimHit);
      if (mapped.status === "ok") suggestions.push(mapped.suggestion);
      else if (mapped.status === "outside_davao") sawOutside = true;
    }
    if (suggestions.length) return { status: "ok", suggestions };
    if (sawOutside || body.length > 0) {
      return { status: "outside_davao", message: OUTSIDE_DAVAO };
    }
    return { status: "empty", message: "No places in Davao City matched that." };
  } catch {
    return { status: "failed", message: GEOCODE_FAILED };
  }
}

export async function reverseNominatim(
  point: GeoPoint,
  version: string,
  fetchImpl: NominatimFetch = fetch,
): Promise<GeocodeResult> {
  if (!pointInDavao(point)) {
    return { status: "outside_davao", message: OUTSIDE_DAVAO };
  }
  try {
    const url =
      `${NOMINATIM_REVERSE}?format=jsonv2&addressdetails=1&zoom=18` +
      `&lat=${encodeURIComponent(String(point.lat))}` +
      `&lon=${encodeURIComponent(String(point.lng))}`;
    const body = await enqueue(() => nominatimGet(url, version, fetchImpl));
    if (!body || typeof body !== "object") return { status: "failed", message: GEOCODE_FAILED };
    const mapped = suggestionFromNominatim(body as NominatimHit);
    if (mapped.status === "ok") {
      return { ...mapped, suggestion: { ...mapped.suggestion, point } };
    }
    if (mapped.status === "empty") {
      // A real GPS pin inside Davao with no street still belongs on the map.
      // The client types the street; we do not invent one.
      return mapped;
    }
    return mapped;
  } catch {
    return { status: "failed", message: GEOCODE_FAILED };
  }
}

/** City is always Davao; the suggestion never writes a different one. */
export function suggestionCity(): string {
  return DELIVERY_CITY;
}
