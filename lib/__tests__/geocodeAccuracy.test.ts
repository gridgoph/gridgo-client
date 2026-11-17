import {
  DAVAO_VIEWBOX,
  GEOCODE_BUSY,
  GEOCODE_OFFLINE,
  GEOCODE_SLOW,
  NOMINATIM_TIMEOUT_MS,
  NO_MATCH,
  STREET_UNREAD,
  distinctSuggestions,
  normalizeQuery,
  pointInDavao,
  reverseNominatim,
  searchNominatim,
  setNominatimMinInterval,
  suggestionFromNominatim,
  withoutUnitNumber,
  type DropoffSuggestion,
  type NominatimHit,
} from "@/lib/geocode";

beforeEach(() => {
  setNominatimMinInterval(0);
});

const asFetch = (impl: jest.Mock) => impl as unknown as typeof fetch;
const answer = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

// Shapes copied from real Nominatim jsonv2 answers for Davao (Nov 2026).
const JOLLIBEE_MAA: NominatimHit = {
  place_id: 1,
  lat: "7.06235",
  lon: "125.59386",
  name: "Jollibee",
  category: "amenity",
  type: "fast_food",
  display_name: "Jollibee, MacArthur Highway, Ma-a, Talomo District, Davao City, Davao Region, 8000, Philippines",
  address: { amenity: "Jollibee", road: "MacArthur Highway", suburb: "Ma-a", city: "Davao City" },
};
const JOLLIBEE_MAA_TWIN: NominatimHit = { ...JOLLIBEE_MAA, place_id: 2, lat: "7.06303", lon: "125.59680" };
const JOLLIBEE_CROSSING: NominatimHit = {
  ...JOLLIBEE_MAA,
  place_id: 3,
  lat: "7.05883",
  lon: "125.56901",
  address: { ...JOLLIBEE_MAA.address, suburb: "74-A Matina Crossing" },
};
const QUIMPO_WAY = (id: number, lat: string, suburb: string): NominatimHit => ({
  place_id: id,
  lat,
  lon: "125.5786",
  name: "Quimpo Boulevard",
  category: "highway",
  type: "primary",
  display_name: `Quimpo Boulevard, ${suburb}, Davao City, Philippines`,
  address: { road: "Quimpo Boulevard", suburb, city: "Davao City" },
});
const TALOMO: NominatimHit = {
  place_id: 9,
  lat: "7.0523",
  lon: "125.5463",
  name: "Talomo Proper",
  category: "boundary",
  type: "administrative",
  display_name: "Talomo Proper, Talomo District, Davao City, Philippines",
  address: { suburb: "Talomo Proper", city_district: "Talomo District", city: "Davao City" },
};

describe("Davao bounds", () => {
  it("covers the whole city, not only the downtown half", () => {
    // Marilog, Paquibato and Baguio districts were outside the old box.
    expect(pointInDavao({ lat: 7.45, lng: 125.3 })).toBe(true); // Marilog Proper
    expect(pointInDavao({ lat: 7.25, lng: 125.25 })).toBe(true); // Baguio District
    expect(pointInDavao({ lat: 7.0731, lng: 125.6128 })).toBe(true); // downtown
    expect(DAVAO_VIEWBOX.north).toBeGreaterThanOrEqual(7.606);
    expect(DAVAO_VIEWBOX.west).toBeLessThanOrEqual(125.2176);
  });

  it("still refuses Samal by name even inside the box", () => {
    const samal: NominatimHit = {
      lat: "7.08",
      lon: "125.68",
      name: "Babak",
      display_name: "Babak, Island Garden City of Samal, Davao del Norte, Philippines",
      address: { city: "Island Garden City of Samal" },
    };
    expect(suggestionFromNominatim(samal).status).toBe("outside_davao");
  });
});

describe("normalizeQuery", () => {
  it("drops the Brgy. prefix no OSM name carries", () => {
    expect(normalizeQuery("Brgy. Talomo")).toBe("Talomo");
    expect(normalizeQuery("barangay 76-A Bucana")).toBe("76-A Bucana");
  });

  it("spells out street abbreviations the way OSM names roads", () => {
    expect(normalizeQuery("Quimpo Blvd")).toBe("Quimpo Boulevard");
    expect(normalizeQuery("Roxas Ave.")).toBe("Roxas Avenue");
    expect(normalizeQuery("Bonifacio St.")).toBe("Bonifacio Street");
    expect(normalizeQuery("St. Peter Chapel")).toBe("St. Peter Chapel");
  });

  it("drops a trailing Davao City but keeps Davao inside a name", () => {
    expect(normalizeQuery("SM Lanang, Davao City")).toBe("SM Lanang");
    expect(normalizeQuery("SM Lanang Davao City")).toBe("SM Lanang");
    expect(normalizeQuery("Ateneo de Davao")).toBe("Ateneo de Davao");
    expect(normalizeQuery("Davao City")).toBe("Davao City");
  });
});

describe("withoutUnitNumber", () => {
  it("drops a house or unit number Davao's OSM does not have", () => {
    expect(withoutUnitNumber("123 Quimpo Boulevard")).toBe("Quimpo Boulevard");
    expect(withoutUnitNumber("Unit 4B, Abreeza Residences")).toBe("Abreeza Residences");
    expect(withoutUnitNumber("Blk 3 Lot 12 Ecoland")).toBe("Ecoland");
    expect(withoutUnitNumber("SM Lanang")).toBeNull();
  });
});

describe("street line", () => {
  it("does not say a road's name twice", () => {
    const road: NominatimHit = {
      lat: "7.0623",
      lon: "125.5939",
      name: "MacArthur Highway",
      category: "highway",
      type: "trunk",
      address: { road: "MacArthur Highway", suburb: "Ma-a", city: "Davao City" },
    };
    const mapped = suggestionFromNominatim(road);
    expect(mapped.status === "ok" && mapped.suggestion.line1).toBe("MacArthur Highway");
  });
});

describe("search rows", () => {
  const ok = (hit: NominatimHit): DropoffSuggestion => {
    const mapped = suggestionFromNominatim(hit);
    if (mapped.status !== "ok") throw new Error(mapped.status);
    return mapped.suggestion;
  };

  it("names the road and barangay so same-named places can be told apart", () => {
    expect(ok(JOLLIBEE_MAA).area).toBe("MacArthur Highway, Ma-a");
    expect(ok(JOLLIBEE_CROSSING).area).toBe("MacArthur Highway, 74-A Matina Crossing");
    expect(ok(QUIMPO_WAY(5, "7.05", "Matina")).area).toBe("Matina");
  });

  it("keeps one row per place", () => {
    const rows = distinctSuggestions([
      ok(JOLLIBEE_MAA),
      ok(JOLLIBEE_MAA_TWIN),
      ok(JOLLIBEE_CROSSING),
      ok(QUIMPO_WAY(5, "7.0548", "Matina")),
      ok(QUIMPO_WAY(6, "7.0514", "Matina")),
      ok(QUIMPO_WAY(7, "7.0625", "Poblacion District")),
    ]);
    expect(rows.map((row) => `${row.label} | ${row.area}`)).toEqual([
      "Jollibee | MacArthur Highway, Ma-a",
      "Jollibee | MacArthur Highway, 74-A Matina Crossing",
      "Quimpo Boulevard | Matina",
      "Quimpo Boulevard | Poblacion District",
    ]);
  });

  it("marks how exactly a hit pins: a door, a road, or an area", () => {
    expect(ok(JOLLIBEE_MAA).precision).toBe("exact");
    expect(ok(QUIMPO_WAY(5, "7.05", "Matina")).precision).toBe("street");
    const area = ok(TALOMO);
    expect(area.precision).toBe("area");
    // A barangay is not a street: the client moves the pin onto their door.
    expect(area.line1).toBe("");
    expect(area.label).toBe("Talomo Proper");
  });
});

describe("searchNominatim", () => {
  it("asks for the cleaned-up words", async () => {
    const fetchImpl = jest.fn(async () => answer([TALOMO]));
    await searchNominatim("Brgy. Talomo", "1.0.0", asFetch(fetchImpl));
    expect(String((fetchImpl.mock.calls[0] as unknown as [string])[0])).toContain("q=Talomo");
  });

  it("tries again without the house number when nothing matched", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(answer([]))
      .mockResolvedValueOnce(answer([QUIMPO_WAY(5, "7.05", "Matina")]));
    const result = await searchNominatim("123 Quimpo Blvd", "1.0.0", asFetch(fetchImpl));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1][0])).toContain("q=Quimpo%20Boulevard");
    expect(result.status).toBe("ok");
  });

  it("says nothing matched, with a next step", async () => {
    const fetchImpl = jest.fn(async () => answer([]));
    await expect(searchNominatim("zzzz", "1.0.0", asFetch(fetchImpl))).resolves.toEqual({
      status: "empty",
      message: NO_MATCH,
    });
  });

  it("tells a rate limit from no connection", async () => {
    const busy = jest.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    await expect(searchNominatim("abreeza", "1.0.0", asFetch(busy))).resolves.toEqual({
      status: "failed",
      message: GEOCODE_BUSY,
    });
    const offline = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(searchNominatim("abreeza", "1.0.0", asFetch(offline))).resolves.toEqual({
      status: "failed",
      message: GEOCODE_OFFLINE,
    });
  });

  it("gives up on a lookup that never answers", async () => {
    jest.useFakeTimers();
    try {
      const hang = jest.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );
      const pending = searchNominatim("abreeza", "1.0.0", asFetch(hang));
      await jest.advanceTimersByTimeAsync(NOMINATIM_TIMEOUT_MS + 10);
      await expect(pending).resolves.toEqual({ status: "failed", message: GEOCODE_SLOW });
    } finally {
      jest.useRealTimers();
    }
  });

  it("never sends a lookup the client has already typed past", async () => {
    const fetchImpl = jest.fn(async () => answer([JOLLIBEE_MAA]));
    const result = await searchNominatim("jolli", "1.0.0", asFetch(fetchImpl), { isCurrent: () => false });
    expect(result).toEqual({ status: "superseded" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("reverseNominatim", () => {
  it("does not take a barangay for a street", async () => {
    const fetchImpl = jest.fn(async () => answer(TALOMO));
    await expect(
      reverseNominatim({ lat: 7.0523, lng: 125.5463 }, "1.0.0", asFetch(fetchImpl)),
    ).resolves.toEqual({ status: "empty", message: STREET_UNREAD });
  });

  it("reverse-geocodes a pin in the newly covered north of the city", async () => {
    const fetchImpl = jest.fn(async () =>
      answer({
        lat: "7.45",
        lon: "125.3",
        category: "highway",
        type: "unclassified",
        display_name: "Davao-Bukidnon Road, Marilog Proper, Marilog District, Davao City, Philippines",
        address: { road: "Davao-Bukidnon Road", village: "Marilog Proper", city: "Davao City" },
      }),
    );
    const result = await reverseNominatim({ lat: 7.45, lng: 125.3 }, "1.0.0", asFetch(fetchImpl));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.suggestion.line1).toBe("Davao-Bukidnon Road");
    expect(result.suggestion.point).toEqual({ lat: 7.45, lng: 125.3 });
  });
});
