import {
  checkAddress,
  composeAddress,
  DELIVERY_CITY,
  parseAddress,
} from "@/lib/address";

describe("composeAddress", () => {
  it("reads in the order a rider reads it", () => {
    expect(
      composeAddress({ line1: "12 J.P. Laurel Ave", barangay: "Bajada", landmark: "" }),
    ).toBe(`12 J.P. Laurel Ave, Bajada, ${DELIVERY_CITY}`);
  });

  it("keeps a landmark distinct from the address itself", () => {
    expect(
      composeAddress({
        line1: "12 J.P. Laurel Ave",
        barangay: "Bajada",
        landmark: "beside the blue gate",
      }),
    ).toBe(`12 J.P. Laurel Ave, Bajada, ${DELIVERY_CITY} (beside the blue gate)`);
  });

  it("drops empty parts instead of leaving stray commas", () => {
    expect(composeAddress({ line1: "", barangay: "Bajada", landmark: "" })).toBe(
      `Bajada, ${DELIVERY_CITY}`,
    );
  });
});

describe("parseAddress", () => {
  it("round-trips an address this app composed", () => {
    const parts = { line1: "12 J.P. Laurel Ave", barangay: "Bajada", landmark: "blue gate" };
    expect(parseAddress(composeAddress(parts))).toEqual(parts);
  });

  it("keeps unplaceable text on the street line where it can be corrected", () => {
    expect(parseAddress("Somewhere near the airport")).toEqual({
      line1: "Somewhere near the airport",
      barangay: "",
      landmark: "",
    });
  });

  it("treats the last segment as the barangay when the city is absent", () => {
    expect(parseAddress("12 Recto St, Poblacion")).toEqual({
      line1: "12 Recto St",
      barangay: "Poblacion",
      landmark: "",
    });
  });

  it("returns empty parts for nothing", () => {
    expect(parseAddress(null)).toEqual({ line1: "", barangay: "", landmark: "" });
  });
});

describe("checkAddress", () => {
  it("points at the field that needs fixing", () => {
    expect(checkAddress({ line1: "", barangay: "Bajada", landmark: "" }).field).toBe("line1");
    expect(checkAddress({ line1: "12 Recto St", barangay: " ", landmark: "" }).field).toBe(
      "barangay",
    );
  });

  it("explains why the barangay matters", () => {
    const result = checkAddress({ line1: "12 Recto St", barangay: "", landmark: "" });
    expect(result.reason).toMatch(/repeat across barangays/i);
  });

  it("accepts a complete address without a landmark", () => {
    expect(checkAddress({ line1: "12 Recto St", barangay: "Poblacion", landmark: "" })).toEqual({
      ok: true,
      field: null,
      reason: null,
    });
  });
});
