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

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const EARTH_RADIUS_KM = 6371;

export function isGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as GeoPoint;
  return (
    typeof point.lat === "number" &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng)
  );
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "2.4 km away", "600 m away" — distance a person can picture. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km.toFixed(1)} km`;
}

/** A region that fits every known point, with room to breathe around them. */
export function regionForPoints(points: GeoPoint[]): MapRegion | null {
  const valid = points.filter(isGeoPoint);
  if (!valid.length) return null;

  const lats = valid.map((p) => p.lat);
  const lngs = valid.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // 40% padding, and a floor so a single point is a street view rather than a
  // pin on a country.
  const latitudeDelta = Math.max((maxLat - minLat) * 1.4, 0.01);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.4, 0.01);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta,
    longitudeDelta,
  };
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
  /** Straight-line distance to the drop-off, or null with no position. */
  remainingKm: number | null;
  /** Whether the map has anything real to draw. */
  hasPosition: boolean;
};

export type TrackingInput = {
  state: string;
  ping: RiderPing | null;
  dropoff: GeoPoint | null;
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
  now = Date.now(),
}: TrackingInput): TrackingSummary {
  const hasPosition = ping != null && isGeoPoint(ping);
  const stale = hasPosition ? isLocationStale(ping.at, now) : false;
  const remainingKm =
    hasPosition && dropoff && isGeoPoint(dropoff) ? distanceKm(ping, dropoff) : null;

  if (!hasPosition) {
    if (state === "rider_assigned") {
      return {
        headline: "A rider is assigned and heading to the print shop.",
        detail: "They start sharing their position once they collect your order.",
        chip: { tone: "info", label: "Rider assigned", icon: "clock" },
        stale: false,
        remainingKm: null,
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
      hasPosition: true,
    };
  }

  const headline =
    remainingKm != null
      ? `Rider is ${formatDistance(remainingKm)} from your drop-off, in a straight line.`
      : "Rider is on the road.";

  return {
    headline,
    detail: `Last updated ${age}. GRIDGO does not publish a live ETA — the promised date below is what your supplier committed to.`,
    chip: { tone: "info", label: `Updated ${age}`, icon: "clock" },
    stale: false,
    remainingKm,
    hasPosition: true,
  };
}
