/**
 * Delivery tracking, watch-only.
 *
 * The client can see where a delivery is; it never steers it. Everything here
 * is derived from data the API actually returns — the order's pickup and
 * drop-off points, the supplier's promised date, and the newest rider ping
 * from `GET /dispatch/:id/location`. There is no ETA field on the platform, so
 * this module never invents one: it reports real distance and says plainly how
 * old the position is.
 */

import type { RiderTracking } from "@/lib/api";

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
export type TrackingIcon = "circle-check" | "triangle-alert" | "circle-x" | "clock" | "radio";

/**
 * Where the client's view of the rider stands (gridgo-api#217).
 *
 * The position is shared from pick-up until the delivery is recorded, at any
 * distance, and never before — so the phases are about that window, not about
 * how close the rider is.
 */
export type TrackingPhase =
  /** Rider has the job but has not collected it: nothing to show, by design. */
  | "before_pickup"
  /** Picked up, and no fix has reached GRIDGO yet. */
  | "waiting"
  | "live"
  /** The newest fix is older than GRIDGO's limit; it stays as the last known position. */
  | "stale"
  /** The sharing window has closed while this screen was open. */
  | "closed";

/** One answer from `GET /dispatch/:id/location`, stamped with the phone's clock. */
export type TrackingSnapshot = {
  ping: RiderPing | null;
  tracking: RiderTracking | null;
  /** Local time the answer arrived, so the age can keep counting between reads. */
  receivedAt: number;
};

export type TrackingView = {
  phase: TrackingPhase;
  /** The marker to draw. Null hides it — before pick-up it must never show. */
  rider: GeoPoint | null;
  /** True when the marker is a last known position, not a current one. */
  stale: boolean;
  /** Seconds since the rider's phone took the fix, or null with no fix. */
  ageSeconds: number | null;
  /** The map's own status, in words as well as colour. */
  status: {
    tone: TrackingTone;
    icon: TrackingIcon;
    label: string;
    detail: string;
  };
  /** "Last updated 2 minutes ago", or null when there is no position. */
  freshness: string | null;
  /** "1.2 km from your drop-off by road" — a fact, never an ETA. */
  distance: string | null;
};

/** GRIDGO's defaults when neither the answer nor the settings say (gridgo-api#217). */
export const DEFAULT_REFRESH_SECONDS = 20;
export const DEFAULT_STALE_AFTER_SECONDS = 120;

/**
 * How often to ask for a newer position. Super Admin sets it between 15 and 30
 * seconds; the newest answer wins over the settings read, and a value outside
 * the range is held to it rather than trusted to poll every second.
 */
export function trackingRefreshMs(
  tracking: Pick<RiderTracking, "refreshIntervalSeconds"> | null | undefined,
  settingSeconds?: number | null,
): number {
  const seconds = tracking?.refreshIntervalSeconds ?? settingSeconds ?? DEFAULT_REFRESH_SECONDS;
  const safe = Number.isFinite(seconds) ? seconds : DEFAULT_REFRESH_SECONDS;
  return Math.min(30, Math.max(15, safe)) * 1000;
}

/** "Last updated just now", "Last updated 3 minutes ago". */
export function lastUpdatedLine(ageSeconds: number | null): string | null {
  if (ageSeconds == null || !Number.isFinite(ageSeconds)) return null;
  if (ageSeconds < 60) return "Last updated just now";
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return `Last updated ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  return `Last updated ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
}

export type TrackingViewInput = {
  state: string;
  snapshot: TrackingSnapshot | null;
  dropoff: GeoPoint | null;
  /** Road distance from OSRM when it answered; null falls back to a straight line. */
  roadDistanceMetres?: number | null;
  /** `settings.riderLocationStaleAfterSeconds`, for an answer that does not carry it. */
  staleAfterSeconds?: number | null;
  now?: number;
};

/**
 * One place that decides what the delivery map says, so the pill on the map,
 * the marker and the screen reader never disagree.
 *
 * GRIDGO's own `tracking.status` leads. The age keeps counting on this phone
 * between reads — from the server's `ageSeconds`, so a phone with a wrong clock
 * still counts right — and a position that crosses the limit while the next read
 * is on its way (or failing) turns stale here rather than looking live.
 */
export function trackingView({
  state,
  snapshot,
  dropoff,
  roadDistanceMetres = null,
  staleAfterSeconds = null,
  now = Date.now(),
}: TrackingViewInput): TrackingView {
  const tracking = snapshot?.tracking ?? null;
  const ping = snapshot?.ping && isGeoPoint(snapshot.ping) ? snapshot.ping : null;
  const limit = tracking?.staleAfterSeconds ?? staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS;
  const elapsed = snapshot ? Math.max(0, (now - snapshot.receivedAt) / 1000) : 0;
  const pingAge = ping ? Math.max(0, (now - Date.parse(ping.at)) / 1000) : null;
  const ageSeconds =
    ping == null
      ? null
      : tracking?.ageSeconds != null && Number.isFinite(tracking.ageSeconds)
        ? Math.floor(tracking.ageSeconds + elapsed)
        : pingAge != null && Number.isFinite(pingAge)
          ? Math.floor(pingAge)
          : null;

  const phase: TrackingPhase = (() => {
    const status = tracking?.status;
    if (status === "inactive" || (!tracking && !ping)) {
      if (state === "rider_assigned") return "before_pickup";
      return status === "inactive" ? "closed" : "waiting";
    }
    if (status === "stale") return "stale";
    if (!ping) return "waiting";
    return ageSeconds == null || ageSeconds >= limit ? "stale" : "live";
  })();

  const rider =
    (phase === "live" || phase === "stale") && ping ? { lat: ping.lat, lng: ping.lng } : null;
  const stale = phase === "stale";
  const freshness = rider ? lastUpdatedLine(ageSeconds) : null;

  const straightKm = rider && dropoff && isGeoPoint(dropoff) ? distanceKm(rider, dropoff) : null;
  const distance =
    phase !== "live"
      ? null
      : roadDistanceMetres != null
        ? `${formatDistance(roadDistanceMetres / 1000)} from your drop-off by road`
        : straightKm != null
          ? `${formatDistance(straightKm)} from your drop-off in a straight line`
          : null;

  const status: TrackingView["status"] = (() => {
    switch (phase) {
      case "before_pickup":
        return {
          tone: "neutral",
          icon: "clock",
          label: "Live location starts at pick-up",
          detail:
            "You will see your rider on this map once they collect your order. Until then, follow their steps below.",
        };
      case "waiting":
        return {
          tone: "info",
          icon: "clock",
          label: "Waiting for the rider’s location",
          detail:
            "Your rider has your order. Their position appears here as soon as their phone shares it.",
        };
      case "live":
        return {
          tone: "success",
          icon: "radio",
          label: "Live location",
          detail: "Your rider is sharing their position until your order is delivered.",
        };
      case "stale":
        return {
          tone: "warning",
          icon: "triangle-alert",
          label: "Rider location temporarily unavailable",
          detail: rider
            ? "The map shows your rider’s last known position."
            : "No position has reached GRIDGO since pick-up. Message or call your rider if you need them.",
        };
      case "closed":
        return {
          tone: "neutral",
          icon: "circle-check",
          label: "Live location has ended",
          detail: "The rider is no longer sharing a position for this order.",
        };
    }
  })();

  return { phase, rider, stale, ageSeconds, status, freshness, distance };
}

// ---------------------------------------------------------------------------
// Delivery milestones
// ---------------------------------------------------------------------------

export type MilestoneCode =
  "rider_assigned" | "heading_to_shop" | "at_shop" | "picked_up" | "on_the_way" | "arrived";

export type Milestone = {
  code: string;
  label: string;
  status: "pending" | "completed" | "passed";
  at: string | null;
};

/** The six steps, in order, with GRIDGO's own words. */
export const MILESTONES: readonly {
  code: MilestoneCode;
  label: string;
  line: string;
}[] = [
  {
    code: "rider_assigned",
    label: "Rider assigned",
    line: "A rider has taken your delivery.",
  },
  {
    code: "heading_to_shop",
    label: "Heading to the shop",
    line: "Your rider is on the way to collect your order.",
  },
  {
    code: "at_shop",
    label: "At the shop",
    line: "Your rider is collecting your order.",
  },
  { code: "picked_up", label: "Picked up", line: "Your rider has your order." },
  {
    code: "on_the_way",
    label: "On the way to you",
    line: "Your order is on its way to you.",
  },
  {
    code: "arrived",
    label: "Arrived",
    line: "Your rider is at your drop-off.",
  },
];

type MilestoneSource = {
  state: string;
  deliveryMilestones?:
    | {
        code: string;
        label?: string | null;
        status?: string | null;
        at?: string | null;
      }[]
    | null;
  timeline?: { at: string; state: string }[] | null;
};

/**
 * The rider's six steps for this order.
 *
 * GRIDGO sends them on every delivery order (gridgo-api#217). An older API does
 * not, so the steps the order's own state proves are filled from it, with the
 * time from its history when there is one and none invented when there is not.
 */
export function deliveryMilestonesOf(order: MilestoneSource): Milestone[] {
  const sent = order.deliveryMilestones;
  if (Array.isArray(sent) && sent.length) {
    return MILESTONES.map(({ code, label }) => {
      const found = sent.find((entry) => entry.code === code);
      const status =
        found?.status === "completed" || found?.status === "passed" ? found.status : "pending";
      return {
        code,
        label: found?.label || label,
        status,
        at: found?.at ?? null,
      };
    });
  }
  const reachedByState: Record<string, MilestoneCode> = {
    rider_assigned: "rider_assigned",
    picked_up: "picked_up",
    out_for_delivery: "on_the_way",
  };
  const reached = MILESTONES.findIndex(({ code }) => code === reachedByState[order.state]);
  const timeAt = (state: string) =>
    [...(order.timeline ?? [])].reverse().find((entry) => entry.state === state)?.at ?? null;
  const proven: Partial<Record<MilestoneCode, string | null>> = {
    rider_assigned: timeAt("rider_assigned"),
    picked_up: timeAt("picked_up"),
    on_the_way: timeAt("out_for_delivery"),
  };
  return MILESTONES.map(({ code, label }, index) => ({
    code,
    label,
    status: index > reached ? "pending" : code in proven ? "completed" : "passed",
    at: index > reached ? null : (proven[code] ?? null),
  }));
}

/** The step the delivery has reached — the last one completed or passed. */
export function currentMilestoneIndex(milestones: Milestone[]): number {
  let current = -1;
  milestones.forEach((milestone, index) => {
    if (milestone.status !== "pending") current = index;
  });
  return current;
}

/** The plain sentence that goes under a step's name. */
export function milestoneLine(code: string): string | null {
  return MILESTONES.find((milestone) => milestone.code === code)?.line ?? null;
}
