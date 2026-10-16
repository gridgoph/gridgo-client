import {
  distanceKm,
  formatDistance,
  fromLonLat,
  haversineMetres,
  isGeoPoint,
  currentMilestoneIndex,
  deliveryMilestonesOf,
  lastUpdatedLine,
  straightLineGeometry,
  toLonLat,
  trackingRefreshMs,
  trackingView,
  type TrackingSnapshot,
} from "@/lib/tracking";
import type { RiderTracking } from "@/lib/api";

const NOW = new Date("2026-08-09T12:00:00+08:00").getTime();
const MINUTE = 60 * 1000;

const DROPOFF = { lat: 7.0853, lng: 125.6137, label: "Bajada, Davao City" };
const SHOP = { lat: 7.064, lng: 125.6085 };

describe("isGeoPoint", () => {
  it("rejects anything without real coordinates", () => {
    expect(isGeoPoint(null)).toBe(false);
    expect(isGeoPoint({ lat: 7, lng: Number.NaN })).toBe(false);
    expect(isGeoPoint({ lat: 7, lng: 125 })).toBe(true);
  });

  it("rejects coordinates outside the globe", () => {
    expect(isGeoPoint({ lat: 91, lng: 125 })).toBe(false);
    expect(isGeoPoint({ lat: 7, lng: 181 })).toBe(false);
  });
});

describe("lon/lat conversion", () => {
  // OSRM and GeoJSON put longitude first. Getting it backwards drops Davao in
  // the ocean, so the boundary is covered both ways.
  it("swaps to GeoJSON order and back", () => {
    expect(toLonLat(DROPOFF)).toEqual([125.6137, 7.0853]);
    expect(fromLonLat([125.6137, 7.0853])).toEqual({ lat: 7.0853, lng: 125.6137 });
    expect(fromLonLat(toLonLat(SHOP))).toEqual({ lat: SHOP.lat, lng: SHOP.lng });
  });

  it("builds a straight-line fallback in GeoJSON order", () => {
    expect(straightLineGeometry(SHOP, DROPOFF)).toEqual([
      [SHOP.lng, SHOP.lat],
      [DROPOFF.lng, DROPOFF.lat],
    ]);
  });
});

describe("haversineMetres", () => {
  it("agrees with the kilometre helper", () => {
    expect(haversineMetres(SHOP, DROPOFF) / 1000).toBeCloseTo(distanceKm(SHOP, DROPOFF), 9);
  });
});

describe("distanceKm", () => {
  it("measures a real Davao hop", () => {
    const km = distanceKm(SHOP, DROPOFF);
    expect(km).toBeGreaterThan(2);
    expect(km).toBeLessThan(4);
  });

  it("is zero at the same point", () => {
    expect(distanceKm(DROPOFF, DROPOFF)).toBeCloseTo(0, 5);
  });
});

describe("formatDistance", () => {
  it("switches to metres under a kilometre", () => {
    expect(formatDistance(0.42)).toMatch(/m$/);
    expect(formatDistance(2.44)).toBe("2.4 km");
  });
});

function tracking(over: Partial<RiderTracking> = {}): RiderTracking {
  return {
    status: "live",
    refreshIntervalSeconds: 20,
    staleAfterSeconds: 120,
    settingsVersion: 3,
    lastUpdatedAt: new Date(NOW - 30_000).toISOString(),
    ageSeconds: 30,
    stale: false,
    message: null,
    ...over,
  };
}

function snapshot(
  over: Partial<RiderTracking> | null,
  ping: { lat: number; lng: number; at: string } | null = { ...SHOP, at: new Date(NOW - 30_000).toISOString() },
  receivedAt = NOW,
): TrackingSnapshot {
  return { ping, tracking: over === null ? null : tracking(over), receivedAt };
}

describe("trackingView", () => {
  it("never draws a rider before pick-up, and says when the map starts", () => {
    const view = trackingView({
      state: "rider_assigned",
      snapshot: snapshot({ status: "inactive", ageSeconds: null, lastUpdatedAt: null }, null),
      dropoff: DROPOFF,
      now: NOW,
    });
    expect(view.phase).toBe("before_pickup");
    expect(view.rider).toBeNull();
    expect(view.status.label).toBe("Live location starts at pick-up");
    expect(view.freshness).toBeNull();
  });

  it("explains before pick-up even before the first answer lands", () => {
    const view = trackingView({ state: "rider_assigned", snapshot: null, dropoff: DROPOFF, now: NOW });
    expect(view.phase).toBe("before_pickup");
  });

  it("shows a live rider at any distance with how old the fix is", () => {
    const view = trackingView({ state: "out_for_delivery", snapshot: snapshot({}), dropoff: DROPOFF, now: NOW });
    expect(view.phase).toBe("live");
    expect(view.rider).toEqual({ lat: SHOP.lat, lng: SHOP.lng });
    expect(view.stale).toBe(false);
    expect(view.freshness).toBe("Last updated just now");
    expect(view.distance).toMatch(/from your drop-off in a straight line/);
  });

  it("prefers OSRM's road distance and never states an ETA", () => {
    const view = trackingView({
      state: "out_for_delivery",
      snapshot: snapshot({}),
      dropoff: DROPOFF,
      roadDistanceMetres: 4200,
      now: NOW,
    });
    expect(view.distance).toBe("4.2 km from your drop-off by road");
    const words = [view.status.label, view.status.detail, view.freshness, view.distance].join(" ");
    expect(words).not.toMatch(/\bETA\b|arriv|min away/i);
  });

  it("keeps counting between reads from the server's age, not the phone's clock", () => {
    // The phone's clock is an hour fast; the server said the fix was 30 s old.
    const skewed = snapshot({ ageSeconds: 30 }, { ...SHOP, at: new Date(NOW - 3_600_000).toISOString() });
    const view = trackingView({ state: "out_for_delivery", snapshot: skewed, dropoff: DROPOFF, now: NOW + 45_000 });
    expect(view.ageSeconds).toBe(75);
    expect(view.phase).toBe("live");
  });

  it("turns stale on this phone when the limit passes before the next read", () => {
    const view = trackingView({
      state: "out_for_delivery",
      snapshot: snapshot({ ageSeconds: 100 }),
      dropoff: DROPOFF,
      now: NOW + 25_000,
    });
    expect(view.phase).toBe("stale");
    expect(view.status.label).toBe("Rider location temporarily unavailable");
  });

  it("keeps the last known position when GRIDGO says it is stale", () => {
    const view = trackingView({
      state: "out_for_delivery",
      snapshot: snapshot({ status: "stale", stale: true, ageSeconds: 200 }),
      dropoff: DROPOFF,
      now: NOW,
    });
    expect(view.phase).toBe("stale");
    expect(view.rider).not.toBeNull();
    expect(view.stale).toBe(true);
    expect(view.freshness).toBe("Last updated 3 minutes ago");
    expect(view.status.tone).toBe("warning");
    expect(view.status.icon).toBe("triangle-alert");
    expect(view.status.detail).toMatch(/last known position/);
    expect(view.distance).toBeNull();
  });

  it("says when no position ever arrived after pick-up", () => {
    const view = trackingView({
      state: "out_for_delivery",
      snapshot: snapshot({ status: "stale", stale: true, ageSeconds: null, lastUpdatedAt: null }, null),
      dropoff: DROPOFF,
      now: NOW,
    });
    expect(view.phase).toBe("stale");
    expect(view.rider).toBeNull();
    expect(view.status.detail).toMatch(/No position has reached GRIDGO since pick-up/);
  });

  it("waits for a first fix after pick-up", () => {
    const view = trackingView({
      state: "picked_up",
      snapshot: snapshot({ status: "waiting", ageSeconds: null, lastUpdatedAt: null }, null),
      dropoff: DROPOFF,
      now: NOW,
    });
    expect(view.phase).toBe("waiting");
    expect(view.rider).toBeNull();
  });

  it("clears the rider once the sharing window closes", () => {
    const view = trackingView({
      state: "out_for_delivery",
      snapshot: snapshot({ status: "inactive", ageSeconds: null, lastUpdatedAt: null }, null),
      dropoff: DROPOFF,
      now: NOW,
    });
    expect(view.phase).toBe("closed");
    expect(view.rider).toBeNull();
  });

  it("judges an older API's bare ping by its own age", () => {
    const fresh = trackingView({
      state: "out_for_delivery",
      snapshot: snapshot(null, { ...SHOP, at: new Date(NOW - MINUTE).toISOString() }),
      dropoff: DROPOFF,
      now: NOW,
    });
    expect(fresh.phase).toBe("live");
    const old = trackingView({
      state: "out_for_delivery",
      snapshot: snapshot(null, { ...SHOP, at: new Date(NOW - 20 * MINUTE).toISOString() }),
      dropoff: DROPOFF,
      now: NOW,
    });
    expect(old.phase).toBe("stale");
    expect(old.rider).not.toBeNull();
  });
});

describe("trackingRefreshMs", () => {
  it("follows the answer, then the setting, then GRIDGO's default", () => {
    expect(trackingRefreshMs({ refreshIntervalSeconds: 25 }, 15)).toBe(25_000);
    expect(trackingRefreshMs(null, 15)).toBe(15_000);
    expect(trackingRefreshMs(null)).toBe(20_000);
  });

  it("holds a value outside 15–30 seconds to the range", () => {
    expect(trackingRefreshMs({ refreshIntervalSeconds: 1 })).toBe(15_000);
    expect(trackingRefreshMs({ refreshIntervalSeconds: 600 })).toBe(30_000);
  });
});

describe("lastUpdatedLine", () => {
  it("says how long ago in words", () => {
    expect(lastUpdatedLine(null)).toBeNull();
    expect(lastUpdatedLine(12)).toBe("Last updated just now");
    expect(lastUpdatedLine(61)).toBe("Last updated 1 minute ago");
    expect(lastUpdatedLine(5 * 60 + 5)).toBe("Last updated 5 minutes ago");
    expect(lastUpdatedLine(2 * 3600)).toBe("Last updated 2 hours ago");
  });
});

describe("deliveryMilestonesOf", () => {
  it("uses GRIDGO's six steps, with no invented times", () => {
    const milestones = deliveryMilestonesOf({
      state: "out_for_delivery",
      deliveryMilestones: [
        { code: "rider_assigned", label: "Rider assigned", status: "completed", at: "2026-10-14T01:00:00Z" },
        { code: "heading_to_shop", label: "Heading to the shop", status: "passed", at: null },
        { code: "at_shop", label: "At the shop", status: "passed", at: null },
        { code: "picked_up", label: "Picked up", status: "completed", at: "2026-10-14T01:20:00Z" },
        { code: "on_the_way", label: "On the way to you", status: "completed", at: "2026-10-14T01:21:00Z" },
        { code: "arrived", label: "Arrived", status: "pending", at: null },
      ],
    });
    expect(milestones.map((m) => m.status)).toEqual([
      "completed",
      "passed",
      "passed",
      "completed",
      "completed",
      "pending",
    ]);
    expect(milestones[1].at).toBeNull();
    expect(currentMilestoneIndex(milestones)).toBe(4);
  });

  it("fills the steps an older API's state proves", () => {
    const milestones = deliveryMilestonesOf({
      state: "picked_up",
      timeline: [
        { at: "2026-10-14T01:00:00Z", state: "rider_assigned" },
        { at: "2026-10-14T01:20:00Z", state: "picked_up" },
      ],
    });
    expect(milestones).toHaveLength(6);
    expect(milestones.map((m) => m.status)).toEqual([
      "completed",
      "passed",
      "passed",
      "completed",
      "pending",
      "pending",
    ]);
    expect(milestones[3].at).toBe("2026-10-14T01:20:00Z");
    expect(currentMilestoneIndex(milestones)).toBe(3);
  });

  it("starts at rider assigned", () => {
    const milestones = deliveryMilestonesOf({ state: "rider_assigned" });
    expect(currentMilestoneIndex(milestones)).toBe(0);
    expect(milestones[0].at).toBeNull();
  });
});
