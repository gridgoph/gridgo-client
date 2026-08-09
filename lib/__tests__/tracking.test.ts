import {
  distanceKm,
  formatDistance,
  isGeoPoint,
  regionForPoints,
  summarizeTracking,
} from "@/lib/tracking";

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

describe("regionForPoints", () => {
  it("returns null when there is nothing real to map", () => {
    expect(regionForPoints([])).toBeNull();
  });

  it("centres on the points and keeps a minimum span", () => {
    const region = regionForPoints([SHOP, DROPOFF]);
    expect(region?.latitude).toBeCloseTo((SHOP.lat + DROPOFF.lat) / 2, 5);
    expect(region?.latitudeDelta).toBeGreaterThanOrEqual(0.01);
  });
});

describe("summarizeTracking", () => {
  it("says a rider is assigned but not yet sharing a position", () => {
    const summary = summarizeTracking({
      state: "rider_assigned",
      ping: null,
      dropoff: DROPOFF,
      now: NOW,
    });
    expect(summary.hasPosition).toBe(false);
    expect(summary.stale).toBe(false);
    expect(summary.headline).toMatch(/rider is assigned/i);
  });

  it("does not present a missing position as an unremarkable state", () => {
    const summary = summarizeTracking({
      state: "out_for_delivery",
      ping: null,
      dropoff: DROPOFF,
      now: NOW,
    });
    expect(summary.chip.label).toMatch(/no location/i);
    expect(summary.chip.icon).toBe("triangle-alert");
  });

  it("reports a fresh position with the real remaining distance", () => {
    const summary = summarizeTracking({
      state: "out_for_delivery",
      ping: { ...SHOP, at: new Date(NOW - MINUTE).toISOString() },
      dropoff: DROPOFF,
      now: NOW,
    });
    expect(summary.stale).toBe(false);
    expect(summary.remainingKm).toBeGreaterThan(0);
    expect(summary.headline).toMatch(/straight line/i);
  });

  it("marks an old position as out of date in words, not only colour", () => {
    const summary = summarizeTracking({
      state: "out_for_delivery",
      ping: { ...SHOP, at: new Date(NOW - 20 * MINUTE).toISOString() },
      dropoff: DROPOFF,
      now: NOW,
    });
    expect(summary.stale).toBe(true);
    expect(summary.headline).toMatch(/out of date/i);
    expect(summary.chip.icon).toBe("triangle-alert");
  });

  it("never claims an ETA the platform does not publish", () => {
    const summary = summarizeTracking({
      state: "out_for_delivery",
      ping: { ...SHOP, at: new Date(NOW - MINUTE).toISOString() },
      dropoff: DROPOFF,
      now: NOW,
    });
    expect(summary.detail).toMatch(/does not publish a live ETA/i);
  });
});
