import {
  DAVAO_VIEWBOX,
  GEOCODE_FAILED,
  OUTSIDE_DAVAO,
  isDavaoCityHit,
  line1FromNominatim,
  nominatimHeaders,
  nominatimUserAgent,
  pointInDavao,
  reverseNominatim,
  searchNominatim,
  setNominatimMinInterval,
  suggestionFromNominatim,
  viewboxQuery,
  type NominatimHit,
} from "@/lib/geocode";

const SM_DAVAO: NominatimHit = {
  place_id: 42,
  lat: "7.0494",
  lon: "125.5880",
  name: "SM City Davao",
  display_name: "SM City Davao, Quimpo Boulevard, Matina, Davao City, Davao Region, 8000, Philippines",
  address: {
    amenity: "SM City Davao",
    road: "Quimpo Boulevard",
    suburb: "Matina",
    city: "Davao City",
    state: "Davao Region",
  },
};

const HOUSE: NominatimHit = {
  place_id: 7,
  lat: 7.0731,
  lon: 125.6128,
  display_name: "12 J.P. Laurel Avenue, Bajada, Davao City, Philippines",
  address: {
    house_number: "12",
    road: "J.P. Laurel Avenue",
    suburb: "Bajada",
    city: "Davao City",
  },
};

beforeEach(() => {
  setNominatimMinInterval(0);
});

describe("Davao bounds", () => {
  it("accepts a downtown pin and refuses Manila", () => {
    expect(pointInDavao({ lat: 7.073, lng: 125.613 })).toBe(true);
    expect(pointInDavao({ lat: 14.5995, lng: 120.9842 })).toBe(false);
  });

  it("writes a Nominatim viewbox in left,top,right,bottom order", () => {
    expect(viewboxQuery()).toBe(
      `${DAVAO_VIEWBOX.west},${DAVAO_VIEWBOX.north},${DAVAO_VIEWBOX.east},${DAVAO_VIEWBOX.south}`,
    );
  });
});

describe("suggestionFromNominatim", () => {
  it("prefers house number and road for the street line", () => {
    const result = suggestionFromNominatim(HOUSE);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.suggestion.line1).toBe("12 J.P. Laurel Avenue");
    expect(result.suggestion.point).toEqual({ lat: 7.0731, lng: 125.6128 });
    expect(result.suggestion.line1.toLowerCase()).not.toMatch(/barangay/);
  });

  it("uses a named building on a road, and keeps the name as a landmark when it is not the street", () => {
    expect(line1FromNominatim(SM_DAVAO)).toBe("SM City Davao, Quimpo Boulevard");
    const result = suggestionFromNominatim(SM_DAVAO);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.suggestion.label).toBe("SM City Davao");
    // The amenity is already in the street line, so it is not repeated.
    expect(result.suggestion.landmark).toBe("");
  });

  it("refuses a hit outside Davao City rather than pinning it", () => {
    const manila: NominatimHit = {
      place_id: 1,
      lat: "14.5547",
      lon: "121.0244",
      name: "SM Aura",
      display_name: "SM Aura, Taguig, Metro Manila, Philippines",
      address: { city: "Taguig", amenity: "SM Aura" },
    };
    expect(suggestionFromNominatim(manila)).toEqual({
      status: "outside_davao",
      message: OUTSIDE_DAVAO,
    });
  });

  it("refuses another Davao-region town even if the coordinates were nearby", () => {
    const tagum: NominatimHit = {
      place_id: 9,
      lat: "7.4479",
      lon: "125.8076",
      display_name: "Tagum City, Davao del Norte, Philippines",
      address: { city: "Tagum", state: "Davao del Norte" },
    };
    expect(isDavaoCityHit(tagum, { lat: 7.4479, lng: 125.8076 })).toBe(false);
    expect(suggestionFromNominatim(tagum).status).toBe("outside_davao");
  });
});

describe("Nominatim identity", () => {
  it("identifies this app and its version", () => {
    expect(nominatimUserAgent("1.0.42")).toBe("GRIDGO-client/1.0.42");
    expect(nominatimHeaders("1.0.0")["User-Agent"]).toBe("GRIDGO-client/1.0.0");
  });
});

describe("searchNominatim", () => {
  it("maps hits inside Davao and drops ones that are not", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => [HOUSE, {
        place_id: 99,
        lat: "14.5995",
        lon: "120.9842",
        display_name: "Manila",
        address: { city: "Manila" },
      }],
    }));
    const result = await searchNominatim("laurel", "1.0.0", fetchImpl as unknown as typeof fetch);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].line1).toBe("12 J.P. Laurel Avenue");
    const called = fetchImpl.mock.calls[0] as unknown as
      | [string, { headers: Record<string, string> }]
      | undefined;
    expect(called).toBeDefined();
    const url = String(called?.[0]);
    expect(url).toContain("nominatim.openstreetmap.org/search");
    expect(url).toContain("bounded=1");
    expect(url).toContain("viewbox=");
    expect(called?.[1]).toEqual({
      headers: nominatimHeaders("1.0.0"),
    });
  });

  it("says so when every hit is outside Davao", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => [
        {
          place_id: 1,
          lat: "14.5995",
          lon: "120.9842",
          display_name: "Manila",
          address: { city: "Manila" },
        },
      ],
    }));
    await expect(searchNominatim("manila", "1.0.0", fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      status: "outside_davao",
      message: OUTSIDE_DAVAO,
    });
  });
});

describe("reverseNominatim", () => {
  it("fills the street from a Davao pin", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => HOUSE,
    }));
    const point = { lat: 7.0731, lng: 125.6128 };
    const result = await reverseNominatim(point, "1.0.0", fetchImpl as unknown as typeof fetch);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.suggestion.line1).toBe("12 J.P. Laurel Avenue");
    expect(result.suggestion.point).toEqual(point);
  });

  it("refuses a pin outside Davao without calling Nominatim", async () => {
    const fetchImpl = jest.fn();
    await expect(
      reverseNominatim({ lat: 14.5995, lng: 120.9842 }, "1.0.0", fetchImpl as unknown as typeof fetch),
    ).resolves.toEqual({ status: "outside_davao", message: OUTSIDE_DAVAO });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not invent a street when reverse geocode fails", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 500,
    }));
    const result = await reverseNominatim(
      { lat: 7.073, lng: 125.613 },
      "1.0.0",
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({ status: "failed", message: GEOCODE_FAILED });
  });
});
