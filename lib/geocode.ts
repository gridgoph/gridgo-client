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
 * `viewbox` is left,top,right,bottom = west,north,east,south. It is the
 * city's own OSM boundary box (6.956–7.606 N, 125.218–125.697 E) with a
 * little margin: the old box stopped at 7.36 N and 125.32 E, so Marilog,
 * Paquibato and most of Baguio and Calinan districts could neither be
 * searched nor pinned. A box is still a box — Samal and the towns around
 * the city are refused by name in `isDavaoCityHit`.
 */
export const DAVAO_VIEWBOX = {
  west: 125.21,
  south: 6.95,
  east: 125.71,
  north: 7.61,
} as const;

/** Downtown Davao (San Pedro Cathedral), where an empty map opens. */
export const DAVAO_DOWNTOWN = { lat: 7.0731, lng: 125.6128 } as const;

/** A lookup that has not answered in this long is given up on. */
export const NOMINATIM_TIMEOUT_MS = 8000;

/** Rows shown under the search field. */
export const SEARCH_RESULT_LIMIT = 5;

export const OUTSIDE_DAVAO =
  "GRIDGO only delivers inside Davao City. Search a place in Davao, or tap the map.";

export const GEOCODE_FAILED =
  "Could not look that place up. Search again, or tap the map.";

export const STREET_UNREAD =
  "Could not read the street here. Type it, or search.";

export const READING_PLACE = "Reading this place…";

export const GEOCODE_BUSY =
  "Map search is busy. Wait a few seconds and search again, or tap the map.";

export const GEOCODE_OFFLINE =
  "Map search needs the internet. Check your connection, or tap the map.";

export const GEOCODE_SLOW =
  "Map search is taking too long. Search again, or tap the map.";

export const NO_MATCH = "No place in Davao City matched that. Try a landmark or street nearby.";

const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

export type NominatimAddress = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  neighbourhood?: string;
  quarter?: string;
  village?: string;
  hamlet?: string;
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
  /** jsonv2: the OSM key (`amenity`, `highway`, `boundary`, `place`…). */
  category?: string;
  type?: string;
  address?: NominatimAddress;
};

/**
 * How exactly a hit pins the drop-off.
 *
 * - `exact`: a building, shop or door — the pin is where the rider goes.
 * - `street`: a whole road; the pin sits on one stretch of it.
 * - `area`: a barangay or district; the pin is its middle, nobody's door.
 */
export type PinPrecision = "exact" | "street" | "area";

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
  /**
   * Second line of a search row: the road and barangay that tell two
   * same-named places apart (three "Jollibee" rows used to read identically).
   */
  area?: string;
  precision?: PinPrecision;
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
/** A newer lookup replaced this one before it reached Nominatim. */
export type Superseded = { status: "superseded" };

export type LookupOptions = {
  /**
   * Asked just before the request goes out. A lookup the client has already
   * typed or tapped past is dropped there, so it never spends a slot of
   * Nominatim's one-request-a-second budget.
   */
  isCurrent?: () => boolean;
};

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
  // A road's own name is the road, not a place on it ("MacArthur Highway,
  // MacArthur Highway" was what a pin dropped on the highway read).
  if (named && road && named.toLowerCase() !== road.toLowerCase()) return `${named}, ${road}`;
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

const AREA_PLACES = new Set([
  "city",
  "town",
  "village",
  "hamlet",
  "suburb",
  "quarter",
  "neighbourhood",
  "city_district",
  "district",
  "county",
  "region",
  "state",
  "island",
  "locality",
  "isolated_dwelling",
]);

export function precisionOf(hit: NominatimHit): PinPrecision {
  const category = hit.category ?? "";
  const type = hit.type ?? "";
  if (category === "boundary") return "area";
  if (category === "place" && AREA_PLACES.has(type)) return "area";
  if (category === "highway") return "street";
  return "exact";
}

/** Barangay (or district) a hit sits in, as OSM files it in the Philippines. */
export function barangayOf(hit: NominatimHit): string {
  const addr = hit.address ?? {};
  return firstText(addr.suburb, addr.quarter, addr.village, addr.neighbourhood, addr.hamlet, addr.city_district);
}

/** Road and barangay, skipping whatever the row's title already says. */
export function areaFromNominatim(hit: NominatimHit, label: string): string {
  const addr = hit.address ?? {};
  const road = firstText(addr.road, addr.pedestrian, addr.footway);
  const title = label.trim().toLowerCase();
  const parts = [road, barangayOf(hit)].filter(
    (part, index, all) => part && part.toLowerCase() !== title && all.indexOf(part) === index,
  );
  return parts.length ? parts.join(", ") : DELIVERY_CITY;
}

export function suggestionFromNominatim(hit: NominatimHit): GeocodeResult {
  const point = pointFromNominatim(hit);
  if (!point) return { status: "failed", message: GEOCODE_FAILED };
  if (!isDavaoCityHit(hit, point) || !pointInDavao(point)) {
    return { status: "outside_davao", message: OUTSIDE_DAVAO };
  }

  const precision = precisionOf(hit);
  const named = line1FromNominatim(hit);
  // A barangay is a place to look, not a street a rider can drive to: the
  // row is offered, the pin lands in its middle, and the street stays empty
  // until the client moves the pin onto their door.
  const line1 = precision === "area" ? "" : named;
  const label = firstText(hit.name, named);
  if (!line1 && !(precision === "area" && label)) {
    return { status: "empty", message: STREET_UNREAD };
  }

  const landmark = line1 ? landmarkFromNominatim(hit, line1) : "";
  const completeAddress = completeAddressFromNominatim(hit);
  return {
    status: "ok",
    suggestion: {
      id: String(hit.place_id ?? `${point.lat},${point.lng}`),
      label,
      line1,
      landmark,
      completeAddress,
      area: areaFromNominatim(hit, label),
      precision,
      point,
    },
  };
}

/**
 * Davao spellings Nominatim does not read.
 *
 * "Brgy." is how every Davao address is written and no OSM name carries it,
 * so "Brgy. Talomo" matched a radio studio called "Barangay LS 103.5" and
 * four other barangays before Talomo itself. Street abbreviations are
 * spelled out the way OSM names the road, and a trailing ", Davao" or
 * "Davao City" is dropped because the search is already bounded to it and
 * no shop's name carries it. "Ateneo de Davao" keeps its Davao.
 */
export function normalizeQuery(raw: string): string {
  const original = raw.replace(/\s+/g, " ").trim();
  let q = original
    .replace(/\b(?:brgy|bgy|barangay)\b\.?\s*/gi, "")
    .replace(/\bblvd\b\.?/gi, "Boulevard")
    .replace(/\bave\b\.?/gi, "Avenue")
    .replace(/\bhwy\b\.?/gi, "Highway")
    .replace(/\brd\b\.?/gi, "Road")
    .replace(/\bnat'?l\b\.?/gi, "National")
    // "St." is Street after a name ("Bonifacio St."), Saint before one.
    .replace(/(\w)\s+st\b\.?(?=\s*(?:,|$))/gi, "$1 Street")
    .replace(/(?:,\s*davao(?:\s+city)?|\s+davao\s+city)(?:,?\s*philippines)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[,\s]+|[,\s]+$/g, "");
  if (!q) q = original;
  return q;
}

/**
 * The same search without the house or unit number in front.
 *
 * OSM in Davao has almost no house numbers, so "123 Quimpo Blvd" and
 * "Unit 4B, Abreeza Residences" often match nothing while the street or
 * building alone does. Null when there was no number to drop.
 */
export function withoutUnitNumber(query: string): string | null {
  const stripped = query
    .replace(/^(?:(?:unit|rm|room|blk|block|lot|phase|ph|bldg|door|apt)\.?\s*#?[\w-]+[,\s]*)+/i, "")
    .replace(/^#?\d+[a-z]?(?:[-/]\w+)?\b[,\s]*/i, "")
    .trim();
  if (!stripped || stripped === query) return null;
  return stripped;
}

function metresBetween(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  return Math.sqrt(dLat * dLat + dLng * dLng) * 6371000;
}

/**
 * One row per place. OSM splits a road into many ways, so "Quimpo Blvd"
 * came back as five identical "Quimpo Boulevard" rows; a road keeps one
 * row per barangay, and a named place one row per spot.
 */
export function distinctSuggestions(suggestions: DropoffSuggestion[]): DropoffSuggestion[] {
  const kept: DropoffSuggestion[] = [];
  for (const next of suggestions) {
    const twin = kept.some((seen) => {
      if (seen.label.toLowerCase() !== next.label.toLowerCase()) return false;
      if ((seen.area ?? "").toLowerCase() === (next.area ?? "").toLowerCase()) return true;
      return metresBetween(seen.point, next.point) < 80;
    });
    if (!twin) kept.push(next);
  }
  return kept;
}

export function viewboxQuery(): string {
  const { west, north, east, south } = DAVAO_VIEWBOX;
  return `${west},${north},${east},${south}`;
}

type NominatimFetch = typeof fetch;

class NominatimError extends Error {
  constructor(readonly kind: "busy" | "offline" | "slow" | "failed" | "superseded") {
    super(`Nominatim ${kind}`);
  }
}

/** Copy for a lookup that did not answer, by why. */
export function lookupFailure(error: unknown): string {
  const kind = error instanceof NominatimError ? error.kind : "failed";
  if (kind === "busy") return GEOCODE_BUSY;
  if (kind === "offline") return GEOCODE_OFFLINE;
  if (kind === "slow") return GEOCODE_SLOW;
  return GEOCODE_FAILED;
}

function superseded(error: unknown): boolean {
  return error instanceof NominatimError && error.kind === "superseded";
}

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

function enqueue<T>(work: () => Promise<T>, isCurrent?: () => boolean): Promise<T> {
  const run = queue.then(async () => {
    if (isCurrent && !isCurrent()) throw new NominatimError("superseded");
    await throttle();
    if (isCurrent && !isCurrent()) throw new NominatimError("superseded");
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

/**
 * One GET, given up after `NOMINATIM_TIMEOUT_MS`.
 *
 * Without the timeout a dropped mobile connection left "Looking in Davao
 * City…" on screen for good. Browsers refuse to let a page set
 * `User-Agent`, so on web Nominatim identifies the app by its Referer.
 */
async function nominatimGet(
  url: string,
  version: string,
  fetchImpl: NominatimFetch,
): Promise<unknown> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timedOut = false;
  const timer = controller
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, NOMINATIM_TIMEOUT_MS)
    : null;
  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: nominatimHeaders(version),
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch {
      throw new NominatimError(timedOut ? "slow" : "offline");
    }
    if (response.status === 429 || response.status === 503) throw new NominatimError("busy");
    if (!response.ok) throw new NominatimError("failed");
    try {
      return await response.json();
    } catch {
      throw new NominatimError(timedOut ? "slow" : "failed");
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function searchUrl(q: string): string {
  return (
    `${NOMINATIM_SEARCH}?format=jsonv2&addressdetails=1&limit=8` +
    `&countrycodes=ph&bounded=1&viewbox=${encodeURIComponent(viewboxQuery())}` +
    `&q=${encodeURIComponent(q)}`
  );
}

export async function searchNominatim(
  query: string,
  version: string,
  fetchImpl: NominatimFetch = fetch,
  options: LookupOptions = {},
): Promise<SearchResult | Superseded> {
  if (!query.trim()) return { status: "empty", message: "Type a place in Davao City." };

  const first = normalizeQuery(query);
  const attempts = [first];
  const fallback = withoutUnitNumber(first);
  if (fallback) attempts.push(fallback);

  let sawOutside = false;
  try {
    for (const q of attempts) {
      const body = await enqueue(() => nominatimGet(searchUrl(q), version, fetchImpl), options.isCurrent);
      if (!Array.isArray(body)) return { status: "failed", message: GEOCODE_FAILED };

      const suggestions: DropoffSuggestion[] = [];
      for (const raw of body) {
        const mapped = suggestionFromNominatim(raw as NominatimHit);
        if (mapped.status === "ok") suggestions.push(mapped.suggestion);
        else if (mapped.status === "outside_davao") sawOutside = true;
      }
      const distinct = distinctSuggestions(suggestions).slice(0, SEARCH_RESULT_LIMIT);
      if (distinct.length) return { status: "ok", suggestions: distinct };
    }
  } catch (error) {
    if (superseded(error)) return { status: "superseded" };
    return { status: "failed", message: lookupFailure(error) };
  }
  if (sawOutside) return { status: "outside_davao", message: OUTSIDE_DAVAO };
  return { status: "empty", message: NO_MATCH };
}

export async function reverseNominatim(
  point: GeoPoint,
  version: string,
  fetchImpl: NominatimFetch = fetch,
  options: LookupOptions = {},
): Promise<GeocodeResult | Superseded> {
  if (!pointInDavao(point)) {
    return { status: "outside_davao", message: OUTSIDE_DAVAO };
  }
  try {
    const url =
      `${NOMINATIM_REVERSE}?format=jsonv2&addressdetails=1&zoom=18` +
      `&lat=${encodeURIComponent(String(point.lat))}` +
      `&lon=${encodeURIComponent(String(point.lng))}`;
    const body = await enqueue(() => nominatimGet(url, version, fetchImpl), options.isCurrent);
    if (!body || typeof body !== "object") return { status: "failed", message: GEOCODE_FAILED };
    const mapped = suggestionFromNominatim(body as NominatimHit);
    if (mapped.status === "ok") {
      // The pin is where the client put it; the answer only names it. A
      // barangay answer names no street, which is the same as none.
      if (!mapped.suggestion.line1) return { status: "empty", message: STREET_UNREAD };
      return { ...mapped, suggestion: { ...mapped.suggestion, point, precision: "exact" } };
    }
    // A real pin inside Davao with no street still belongs on the map. The
    // client types the street; we do not invent one.
    return mapped;
  } catch (error) {
    if (superseded(error)) return { status: "superseded" };
    return { status: "failed", message: lookupFailure(error) };
  }
}

/** City is always Davao; the suggestion never writes a different one. */
export function suggestionCity(): string {
  return DELIVERY_CITY;
}
