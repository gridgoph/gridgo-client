/**
 * OSRM public demo routing for the delivery map.
 *
 * Free, keyless, no SLA, rate-limited. Callers must treat failure as normal and
 * fall back to a straight line — tracking is a watch-only surface and must
 * never depend on a third party being up.
 *
 * This mirrors `lib/osrm.ts` in **gridgo-rider** on purpose: both apps run one
 * map stack (Leaflet + OpenStreetMap tiles in a WebView, OSRM for the line),
 * so a fix in one is a fix a reader can carry to the other.
 *
 * Path order is lon,lat (not lat,lng). Getting it backwards drops Davao in the
 * ocean — the classic bug for this stack.
 */

import {
  haversineMetres,
  isGeoPoint,
  straightLineGeometry,
  toLonLat,
  type GeoPoint,
  type LonLat,
} from "@/lib/tracking";

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

export type RouteResult = {
  /** True when OSRM returned a road route; false for straight-line fallback. */
  routed: boolean;
  distanceMetres: number;
  /**
   * OSRM's own travel-time estimate.
   *
   * The client deliberately does not surface this: GRIDGO publishes no ETA,
   * and a routing engine's traffic-free guess shown next to a delivery reads
   * as a promise nobody made. Kept because it is part of the response and the
   * rider app — which is planning its own trip — legitimately uses it.
   */
  durationSeconds: number;
  /** GeoJSON LineString coordinates as [lon, lat][]. */
  coordinates: LonLat[];
  /** Plain-language status when routing is unavailable. */
  statusLabel: string | null;
};

export type OsrmRouteResponse = {
  code?: string;
  routes?: {
    distance: number;
    duration: number;
    geometry?: {
      type?: string;
      coordinates?: LonLat[];
    };
  }[];
};

/**
 * Parse an OSRM JSON body into a RouteResult, or null if unusable.
 * Pure — unit-tested without the network.
 */
export function parseOsrmResponse(data: OsrmRouteResponse): RouteResult | null {
  if (data.code !== "Ok" || !data.routes?.length) return null;
  const route = data.routes[0];
  const coords = route?.geometry?.coordinates;
  if (!route || !coords || coords.length < 2) return null;
  if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
    return null;
  }
  return {
    routed: true,
    distanceMetres: route.distance,
    durationSeconds: route.duration,
    coordinates: coords,
    statusLabel: null,
  };
}

/** Straight-line fallback when OSRM is down, rate-limited, or malformed. */
export function fallbackRoute(from: GeoPoint, to: GeoPoint): RouteResult {
  const distanceMetres = haversineMetres(from, to);
  // Rough urban delivery estimate: ~18 km/h → 5 m/s. Never shown as an ETA.
  const durationSeconds = distanceMetres / 5;
  return {
    routed: false,
    distanceMetres,
    durationSeconds,
    coordinates: straightLineGeometry(from, to),
    statusLabel: "Route unavailable — straight line shown",
  };
}

/**
 * Fetch a driving route between two points.
 * Always resolves with a usable RouteResult; network failures use fallback.
 */
export async function fetchRoute(
  from: GeoPoint,
  to: GeoPoint,
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<RouteResult> {
  if (!isGeoPoint(from) || !isGeoPoint(to)) {
    return {
      routed: false,
      distanceMetres: 0,
      durationSeconds: 0,
      coordinates: [],
      statusLabel: "Route unavailable — coordinates missing",
    };
  }

  // Same point — no request needed.
  if (from.lat === to.lat && from.lng === to.lng) {
    return {
      routed: true,
      distanceMetres: 0,
      durationSeconds: 0,
      coordinates: [toLonLat(from), toLonLat(to)],
      statusLabel: null,
    };
  }

  const [lon1, lat1] = toLonLat(from);
  const [lon2, lat2] = toLonLat(to);
  const url = `${OSRM_BASE}/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
  const doFetch = options?.fetchImpl ?? fetch;

  try {
    const res = await doFetch(url, {
      signal: options?.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return fallbackRoute(from, to);
    const data = (await res.json()) as OsrmRouteResponse;
    return parseOsrmResponse(data) ?? fallbackRoute(from, to);
  } catch {
    return fallbackRoute(from, to);
  }
}
