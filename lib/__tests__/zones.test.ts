import {
  activeZones,
  DEFAULT_ZONE_CODE,
  findZone,
  resolveZoneCode,
  zoneName,
  type Zone,
} from "@/lib/zones";

const zones: Zone[] = [
  {
    id: "zone_central",
    code: "davao_central",
    name: "Davao Central (Bajada / JP Laurel)",
    active: true,
  },
  {
    id: "zone_west",
    code: "davao_west",
    name: "Davao West (Toril side)",
    active: true,
  },
  {
    id: "zone_paused",
    code: "davao_island",
    name: "Samal (paused)",
    active: false,
  },
];

describe("activeZones", () => {
  it("hides a paused zone from the picker", () => {
    expect(activeZones(zones).map((z) => z.code)).toEqual(["davao_central", "davao_west"]);
  });
});

describe("a zone carries no money", () => {
  it("has no fee field to read", () => {
    // Delivery is priced by the distance from the assigned supplier's shop,
    // in bands Operations can change without a release. A zone that still
    // carried a fee would disagree with what the client is charged.
    for (const zone of zones) {
      expect(zone).not.toHaveProperty("deliveryFeeMinor");
    }
  });
});

describe("zoneName", () => {
  it("prefers the platform name", () => {
    expect(zoneName(zones, "davao_west")).toBe("Davao West (Toril side)");
  });

  it("still shows a label before zones load, never a raw code", () => {
    expect(zoneName([], "davao_west")).toBe("Davao West");
    expect(zoneName([], "davao_moon")).toBe("Davao area");
    expect(zoneName([], "davao_moon")).not.toMatch(/_/);
  });
});

describe("resolveZoneCode", () => {
  it("keeps a choice the platform still offers", () => {
    expect(resolveZoneCode(zones, "davao_west")).toBe("davao_west");
  });

  it("falls back to central when the stored zone is gone", () => {
    expect(resolveZoneCode(zones, "davao_island")).toBe(DEFAULT_ZONE_CODE);
  });

  it("takes the first real zone when central is not offered", () => {
    expect(resolveZoneCode([zones[1]], "davao_island")).toBe("davao_west");
  });
});

describe("findZone", () => {
  it("is null-safe on an unset code", () => {
    expect(findZone(zones, null)).toBeNull();
  });
});
