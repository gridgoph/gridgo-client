import {
  activeZones,
  DEFAULT_ZONE_CODE,
  findZone,
  resolveZoneCode,
  zoneDeliveryFeeMinor,
  zoneName,
  type Zone,
} from "@/lib/zones";

const zones: Zone[] = [
  {
    id: "zone_central",
    code: "davao_central",
    name: "Davao Central (Bajada / JP Laurel)",
    deliveryFeeMinor: 15100,
    active: true,
  },
  {
    id: "zone_west",
    code: "davao_west",
    name: "Davao West (Toril side)",
    deliveryFeeMinor: 20000,
    active: true,
  },
  {
    id: "zone_paused",
    code: "davao_island",
    name: "Samal (paused)",
    deliveryFeeMinor: 50000,
    active: false,
  },
];

describe("activeZones", () => {
  it("hides a paused zone from the picker", () => {
    expect(activeZones(zones).map((z) => z.code)).toEqual(["davao_central", "davao_west"]);
  });
});

describe("zoneDeliveryFeeMinor", () => {
  it("uses the fee the platform serves, not a constant", () => {
    expect(zoneDeliveryFeeMinor(zones, "davao_west")).toBe(20000);
    expect(zoneDeliveryFeeMinor(zones, "davao_central")).toBe(15100);
  });

  it("returns null rather than guessing when zones have not loaded", () => {
    expect(zoneDeliveryFeeMinor([], "davao_west")).toBeNull();
    expect(zoneDeliveryFeeMinor(zones, "unknown")).toBeNull();
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
