import type { PlatformSettings } from "@/lib/api";
import {
  chargedKilometres,
  deliveryFeeForDistance,
  deliveryZoneRows,
  legZoneLine,
  listingZoneLine,
  outOfZoneWarning,
  ratingLabel,
  ratingLine,
  zoneForDistance,
  zoneLine,
} from "@/lib/distanceZone";

/** The defaults gridgo-api#121 seeds. */
const ZONES: Pick<PlatformSettings, "deliveryFeeBands"> = {
  deliveryFeeBands: [
    { zone: "nearby", label: "Nearby", maxDistanceMeters: 5000, feeMinor: 2500 },
    { zone: "away", label: "Away", maxDistanceMeters: 10000, feeMinor: 5000 },
    { zone: "long_distance", label: "Long Distance", maxDistanceMeters: 15000, feeMinor: 7500 },
    {
      zone: "out_of_zone",
      label: "Out of Zone",
      maxDistanceMeters: null,
      baseFeeMinor: 7500,
      perKmMinor: 1000,
    },
  ],
};

describe("zoneForDistance", () => {
  it("puts each limit in the zone before it, and one metre over in the next", () => {
    expect(zoneForDistance(ZONES, 0)?.label).toBe("Nearby");
    expect(zoneForDistance(ZONES, 5000)?.label).toBe("Nearby");
    expect(zoneForDistance(ZONES, 5001)?.label).toBe("Away");
    expect(zoneForDistance(ZONES, 10000)?.label).toBe("Away");
    expect(zoneForDistance(ZONES, 10001)?.label).toBe("Long Distance");
    expect(zoneForDistance(ZONES, 15000)?.label).toBe("Long Distance");
    expect(zoneForDistance(ZONES, 15001)).toEqual({ key: "out_of_zone", label: "Out of Zone" });
  });

  it("names nothing on an API whose bands carry no words", () => {
    expect(zoneForDistance({ deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }] }, 100))
      .toBeNull();
  });
});

describe("deliveryFeeForDistance", () => {
  it("prices the three near zones flat", () => {
    expect(deliveryFeeForDistance(ZONES, 1)).toBe(2500);
    expect(deliveryFeeForDistance(ZONES, 5000)).toBe(2500);
    expect(deliveryFeeForDistance(ZONES, 5001)).toBe(5000);
    expect(deliveryFeeForDistance(ZONES, 10000)).toBe(5000);
    expect(deliveryFeeForDistance(ZONES, 10001)).toBe(7500);
    expect(deliveryFeeForDistance(ZONES, 15000)).toBe(7500);
  });

  it("prices Out of Zone as base plus every started kilometre of the whole trip", () => {
    // gridgo-api's own worked examples.
    expect(deliveryFeeForDistance(ZONES, 15001)).toBe(23500);
    expect(deliveryFeeForDistance(ZONES, 16000)).toBe(23500);
    expect(deliveryFeeForDistance(ZONES, 16001)).toBe(24500);
    expect(deliveryFeeForDistance(ZONES, 42300)).toBe(7500 + 1000 * 43);
  });

  it("rounds kilometres up, never to the nearest", () => {
    expect(chargedKilometres(16001)).toBe(17);
    expect(chargedKilometres(16000)).toBe(16);
    // 16.04 km displays as "16.0 km", but is charged as 17.
    expect(deliveryFeeForDistance(ZONES, 16040)).toBe(7500 + 1000 * 17);
  });

  it("reads Operations' prices, not the defaults", () => {
    const edited = {
      deliveryFeeBands: ZONES.deliveryFeeBands.map((band) =>
        band.zone === "out_of_zone" ? { ...band, baseFeeMinor: 8000, perKmMinor: 1200 } : band,
      ),
    };
    expect(deliveryFeeForDistance(edited, 20000)).toBe(8000 + 1200 * 20);
  });

  it("still prices an API from before the zones", () => {
    expect(deliveryFeeForDistance({ deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }] }, 99000))
      .toBe(2500);
    expect(deliveryFeeForDistance({ deliveryFeeBands: [] }, 1000)).toBeNull();
  });
});

describe("zoneLine", () => {
  it("shows kilometres on Out of Zone only", () => {
    expect(zoneLine({ key: "out_of_zone", label: "Out of Zone" }, 16)).toBe("Out of Zone · 16.0 km");
    expect(zoneLine({ key: "nearby", label: "Nearby" }, 2.3)).toBe("Nearby");
    expect(zoneLine({ key: "long_distance", label: "Long Distance" }, 14.9)).toBe("Long Distance");
  });

  it("is the word alone when Out of Zone came without a figure", () => {
    expect(zoneLine({ key: "out_of_zone", label: "Out of Zone" })).toBe("Out of Zone");
  });

  it("says nothing without a zone", () => {
    expect(zoneLine(null)).toBeNull();
    expect(listingZoneLine({ distanceZone: null })).toBeNull();
  });

  it("reads a listing's own fields", () => {
    expect(
      listingZoneLine({ distanceZone: { key: "out_of_zone", label: "Out of Zone" }, distanceKm: 21.4 }),
    ).toBe("Out of Zone · 21.4 km");
  });

  it("draws a checkout leg's kilometres from its metres, on Out of Zone only", () => {
    expect(legZoneLine({ key: "out_of_zone", label: "Out of Zone" }, 16040)).toBe(
      "Out of Zone · 16.0 km",
    );
    expect(legZoneLine({ key: "away", label: "Away" }, 7400)).toBe("Away");
  });
});

describe("ratingLine", () => {
  it("draws the average to one decimal with the count", () => {
    expect(ratingLine({ average: 4.6, count: 12 })).toBe("4.6 (12)");
    expect(ratingLine({ average: 5, count: 5 })).toBe("5.0 (5)");
    expect(ratingLabel({ average: 4.6, count: 12 })).toBe("Rated 4.6 out of 5 from 12 reviews");
  });

  it("draws nothing when the API sent no rating (under five reviews)", () => {
    expect(ratingLine(undefined)).toBeNull();
    expect(ratingLabel(undefined)).toBeNull();
  });
});

describe("deliveryZoneRows", () => {
  it("lists the four zones with their ranges and live prices", () => {
    expect(deliveryZoneRows(ZONES)).toEqual([
      { key: "nearby", label: "Nearby", range: "Up to 5 km", price: "₱25.00", outOfZone: false },
      { key: "away", label: "Away", range: "5–10 km", price: "₱50.00", outOfZone: false },
      {
        key: "long_distance",
        label: "Long Distance",
        range: "10–15 km",
        price: "₱75.00",
        outOfZone: false,
      },
      {
        key: "out_of_zone",
        label: "Out of Zone",
        range: "Over 15 km",
        price: "₱75.00 + ₱10.00 per km",
        outOfZone: true,
      },
    ]);
  });

  it("lists nothing rather than invent words for unnamed bands", () => {
    expect(deliveryZoneRows({ deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }] }))
      .toEqual([]);
    expect(deliveryZoneRows(null)).toEqual([]);
  });
});

describe("outOfZoneWarning", () => {
  it("says it is outside the zones, how it is charged, and that it can cost a lot", () => {
    const body = outOfZoneWarning({ distanceKm: 16, settings: ZONES });
    expect(body).toContain("16.0 km from your drop-off");
    expect(body).toContain("base fee plus a fee for every kilometre (₱75.00 + ₱10.00 per km)");
    expect(body).toContain("can cost a lot more");
    expect(body).toContain("pick another listing");
  });

  it("still warns before settings have loaded", () => {
    expect(outOfZoneWarning({ settings: null })).toContain(
      "base fee plus a fee for every kilometre, so it can cost a lot more",
    );
  });
});
