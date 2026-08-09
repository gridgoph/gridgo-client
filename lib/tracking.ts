/**
 * Delivery tracking, watch-only.
 *
 * The client can see where a delivery is; it never steers it. Everything here
 * is derived from data the API actually returns — the order's pickup and
 * drop-off points, the supplier's promised date, and the newest rider ping
 * from `GET /dispatch/:id/location`. There is no ETA field on the platform, so
 * this module never invents one: it reports real straight-line distance and
 * says plainly how old the position is.
 */

import { formatRelativeTime, isLocationStale } from "@/lib/relativeTime";

export type GeoPoint = {
  lat: number;
  lng: number;
  label?: string | null;
};

export type RiderPing = {
  lat: number;
  lng: number;
  at: string;
};

/**
 * GeoJSON Position is [longitude, latitude] — the opposite order to app code.
 * OSRM speaks the same order. Convert only at the network/HTML boundary;
 * getting it backwards drops Davao in the ocean.
 */
export type LonLat = [number, number];

const EARTH_RADIUS_M = 6_371_000;

export function isGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as GeoPoint;
  return (
    typeof point.lat === "number" &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

/** App coords → OSRM / GeoJSON order. */
export function toLonLat(point: GeoPoint): LonLat {
  return [point.lng, point.lat];
}

/** GeoJSON / OSRM position → app coords. */
export function fromLonLat(position: LonLat | number[]): GeoPoint {
  return { lng: position[0] as number, lat: position[1] as number };
}

/** Straight line between two points, in GeoJSON order. */
export function straightLineGeometry(a: GeoPoint, b: GeoPoint): LonLat[] {
  return [toLonLat(a), toLonLat(b)];
}

/** Great-circle distance in metres. */
export function haversineMetres(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  return haversineMetres(a, b) / 1000;
}

/** "2.4 km away", "600 m away" — distance a person can picture. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km.toFixed(1)} km`;
}

export type TrackingTone = "success" | "warning" | "error" | "info" | "neutral";
export type TrackingIcon = "circle-check" | "triangle-alert" | "circle-x" | "clock" | "square-pen";

export type TrackingSummary = {
  /** What is happening, in the client's words. */
  headline: string;
  /** The honest qualification: how old the position is, or that there is none. */
  detail: string;
  chip: { tone: TrackingTone; label: string; icon: TrackingIcon };
  /** True when a position exists but is too old to present as current. */
  stale: boolean;
  /** Distance left to the drop-off, or null with no position. */
  remainingKm: number | null;
  /** True when `remainingKm` came from OSRM's road route, not a straight line. */
  remainingIsRoad: boolean;
  /** Whether the map has anything real to draw. */
  hasPosition: boolean;
};

export type TrackingInput = {
  state: string;
  ping: RiderPing | null;
  dropoff: GeoPoint | null;
  /**
   * Road distance in metres from OSRM, when it answered. Null falls back to
   * the straight line, and the copy says which one the client is reading.
   */
  roadDistanceMetres?: number | null;
  now?: Date | number;
};

/**
 * One place that decides what the tracking card says, so the map caption, the
 * status chip and the screen reader never disagree.
 */
export function summarizeTracking({
  state,
  ping,
  dropoff,
  roadDistanceMetres = null,
  now = Date.now(),
}: TrackingInput): TrackingSummary {
  const hasPosition = ping != null && isGeoPoint(ping);
  const stale = hasPosition ? isLocationStale(ping.at, now) : false;

  const straightKm =
    hasPosition && dropoff && isGeoPoint(dropoff) ? distanceKm(ping, dropoff) : null;
  const remainingIsRoad = hasPosition && roadDistanceMetres != null;
  const remainingKm = remainingIsRoad ? (roadDistanceMetres as number) / 1000 : straightKm;

  if (!hasPosition) {
    if (state === "rider_assigned") {
      return {
        headline: "A rider is assigned and heading to the print shop.",
        detail: "They start sharing their position once they collect your order.",
        chip: { tone: "info", label: "Rider assigned", icon: "clock" },
        stale: false,
        remainingKm: null,
        remainingIsRoad: false,
        hasPosition: false,
      };
    }
    return {
      headline: "Your order is on its way.",
      detail:
        "The rider app has not shared a position for this trip yet. Nothing is shown on the map until it does.",
      chip: { tone: "warning", label: "No location shared", icon: "triangle-alert" },
      stale: false,
      remainingKm: null,
      remainingIsRoad: false,
      hasPosition: false,
    };
  }

  const age = formatRelativeTime(ping.at, now);

  if (stale) {
    return {
      headline: "This position is out of date.",
      detail: `Last updated ${age}. The rider has moved since then — treat the pin as where they were, not where they are.`,
      chip: { tone: "warning", label: `Location ${age}`, icon: "triangle-alert" },
      stale: true,
      remainingKm,
      remainingIsRoad,
      hasPosition: true,
    };
  }

  const headline =
    remainingKm == null
      ? "Rider is on the road."
      : remainingIsRoad
        ? `Rider is ${formatDistance(remainingKm)} from your drop-off by road.`
        : `Rider is ${formatDistance(remainingKm)} from your drop-off, in a straight line.`;

  return {
    headline,
    // The route line comes from OSRM, which also returns a travel time. That
    // time is a routing engine's guess about traffic-free driving, not a
    // commitment anyone at GRIDGO made, so it is deliberately not shown as an
    // ETA. Distance is a fact; the promised date is the commitment.
    detail: `Last updated ${age}. GRIDGO does not publish a live ETA — the promised date below is what your supplier committed to.`,
    chip: { tone: "info", label: `Updated ${age}`, icon: "clock" },
    stale: false,
    remainingKm,
    remainingIsRoad,
    hasPosition: true,
  };
}
