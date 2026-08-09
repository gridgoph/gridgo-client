import {
  fallbackRoute,
  fetchRoute,
  parseOsrmResponse,
  type OsrmRouteResponse,
} from "@/lib/osrm";

const SHOP = { lat: 7.064, lng: 125.6085 };
const DROPOFF = { lat: 7.0853, lng: 125.6137 };

const okResponse: OsrmRouteResponse = {
  code: "Ok",
  routes: [
    {
      distance: 4210.3,
      duration: 612.5,
      geometry: {
        type: "LineString",
        coordinates: [
          [125.6085, 7.064],
          [125.611, 7.0742],
          [125.6137, 7.0853],
        ],
      },
    },
  ],
};

describe("parseOsrmResponse", () => {
  it("reads a road route", () => {
    const result = parseOsrmResponse(okResponse);
    expect(result?.routed).toBe(true);
    expect(result?.distanceMetres).toBeCloseTo(4210.3, 5);
    expect(result?.coordinates).toHaveLength(3);
    expect(result?.statusLabel).toBeNull();
  });

  it("keeps GeoJSON lon,lat order untouched", () => {
    // Longitude first. Swapping these puts Davao in the Pacific.
    expect(parseOsrmResponse(okResponse)?.coordinates[0]).toEqual([125.6085, 7.064]);
  });

  it.each([
    ["a non-Ok code", { code: "NoRoute", routes: [] }],
    ["no routes at all", { code: "Ok" }],
    ["a one-point geometry", {
      code: "Ok",
      routes: [{ distance: 1, duration: 1, geometry: { coordinates: [[125, 7]] as [number, number][] } }],
    }],
    ["a missing geometry", { code: "Ok", routes: [{ distance: 1, duration: 1 }] }],
    ["a non-finite distance", {
      code: "Ok",
      routes: [{
        distance: Number.NaN,
        duration: 1,
        geometry: { coordinates: [[125, 7], [126, 8]] as [number, number][] },
      }],
    }],
  ])("returns null for %s", (_label, body) => {
    expect(parseOsrmResponse(body as OsrmRouteResponse)).toBeNull();
  });
});

describe("fallbackRoute", () => {
  it("draws a straight line and says so", () => {
    const result = fallbackRoute(SHOP, DROPOFF);
    expect(result.routed).toBe(false);
    expect(result.coordinates).toEqual([
      [SHOP.lng, SHOP.lat],
      [DROPOFF.lng, DROPOFF.lat],
    ]);
    expect(result.statusLabel).toMatch(/straight line/i);
    expect(result.distanceMetres).toBeGreaterThan(2000);
  });
});

describe("fetchRoute", () => {
  it("builds a lon,lat OSRM path", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => okResponse,
    })) as unknown as typeof fetch;

    const result = await fetchRoute(SHOP, DROPOFF, { fetchImpl });

    const url = (fetchImpl as unknown as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("125.6085,7.064;125.6137,7.0853");
    expect(url).toContain("geometries=geojson");
    expect(result.routed).toBe(true);
  });

  it("falls back rather than throwing when OSRM is unreachable", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error("Network request failed");
    }) as unknown as typeof fetch;

    const result = await fetchRoute(SHOP, DROPOFF, { fetchImpl });
    expect(result.routed).toBe(false);
    expect(result.coordinates).toHaveLength(2);
  });

  it("falls back on a rate-limit response", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    expect((await fetchRoute(SHOP, DROPOFF, { fetchImpl })).routed).toBe(false);
  });

  it("does not call the network for unusable coordinates", async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const result = await fetchRoute(
      { lat: Number.NaN, lng: 125 },
      DROPOFF,
      { fetchImpl },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.coordinates).toEqual([]);
    expect(result.statusLabel).toMatch(/coordinates missing/i);
  });

  it("does not call the network when both points are the same", async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const result = await fetchRoute(SHOP, { ...SHOP }, { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.distanceMetres).toBe(0);
  });
});
