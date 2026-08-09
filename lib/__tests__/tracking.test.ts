import {
  distanceKm,
  formatDistance,
  fromLonLat,
  haversineMetres,
  isGeoPoint,
  straightLineGeometry,
  summarizeTracking,
  toLonLat,
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

  it("falls back to a straight line when OSRM gave no road distance", () => {
    const summary = summarizeTracking({
      state: "out_for_delivery",
      ping: { ...SHOP, at: new Date(NOW - MINUTE).toISOString() },
      dropoff: DROPOFF,
      now: NOW,
    });
    expect(summary.stale).toBe(false);
    expect(summary.remainingKm).toBeGreaterThan(0);
    expect(summary.remainingIsRoad).toBe(false);
    expect(summary.headline).toMatch(/straight line/i);
  });

  it("prefers OSRM's road distance and says which one it is", () => {
    const summary = summarizeTracking({
      state: "out_for_delivery",
      ping: { ...SHOP, at: new Date(NOW - MINUTE).toISOString() },
      dropoff: DROPOFF,
      roadDistanceMetres: 4200,
      now: NOW,
    });
    expect(summary.remainingIsRoad).toBe(true);
    expect(summary.remainingKm).toBeCloseTo(4.2, 5);
    expect(summary.headline).toMatch(/4\.2 km from your drop-off by road/);
    expect(summary.headline).not.toMatch(/straight line/i);
  });

  it("ignores a road distance when there is no position to measure from", () => {
    const summary = summarizeTracking({
      state: "out_for_delivery",
      ping: null,
      dropoff: DROPOFF,
      roadDistanceMetres: 4200,
      now: NOW,
    });
    expect(summary.remainingKm).toBeNull();
    expect(summary.remainingIsRoad).toBe(false);
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
