import type { MatchReason } from "@/lib/api";
import {
  matchDistanceMeters,
  ordinal,
  primaryReason,
  queueLine,
  reasonLine,
  reasonTag,
} from "@/lib/match";

function reason(overrides: Partial<MatchReason> = {}): MatchReason {
  return {
    code: "ranked_speed",
    factor: "speed",
    rank: 1,
    weight: 0.5,
    detail: "0 jobs ahead; about 48 hours",
    ...overrides,
  };
}

const RANKED: MatchReason[] = [
  reason({ code: "ranked_speed", factor: "speed", rank: 1, weight: 0.5 }),
  reason({ code: "ranked_quality", factor: "quality", rank: 2, weight: 0.3 }),
  reason({ code: "ranked_distance", factor: "distance", rank: 3, weight: 0.2 }),
];

describe("primaryReason", () => {
  it("leads with the top-ranked factor", () => {
    expect(primaryReason(RANKED)?.factor).toBe("speed");
  });

  it("lets a same-shop bundle outrank the ranking", () => {
    const bundled = [reason({ code: "same_shop_bundle", factor: "bundle", rank: 0 }), ...RANKED];
    expect(primaryReason(bundled)?.factor).toBe("bundle");
  });

  it("has nothing to say when the match gave no reasons", () => {
    expect(primaryReason([])).toBeNull();
  });
});

describe("reasonTag", () => {
  it("names the factor in the client's words, not the API's", () => {
    expect(reasonTag("speed")).toBe("FASTEST");
    expect(reasonTag("distance")).toBe("CLOSEST");
    expect(reasonTag("quality")).toBe("STRONGEST LISTING");
    expect(reasonTag("bundle")).toBe("ALREADY IN YOUR ORDER");
  });
});

describe("reasonLine", () => {

  it("never repeats the API's working notes", () => {
    const line = reasonLine({
      reason: RANKED[0],
      distanceMeters: 1240,
      alternativesCount: 2,
      subcategoryName: "Flyers",
    });
    expect(line).not.toContain("jobs ahead");
    expect(line).not.toContain("%");
    expect(line).not.toContain("metres from the delivery pin");
  });

  it("leaves the ready promise to the card readout when speed decided it", () => {
    expect(
      reasonLine({
        reason: RANKED[0],
        distanceMeters: null,
        alternativesCount: 1,
        subcategoryName: "Flyers",
      }),
    ).toBe("Fastest on flyers.");
  });

  it("gives the distance when that is what decided it", () => {
    expect(
      reasonLine({
        reason: reason({ factor: "distance" }),
        distanceMeters: 1400,
        alternativesCount: 3,
        subcategoryName: "Flyers",
      }),
    ).toContain("Closest to your drop-off — 1.4 km away");
  });

  it("does not claim GRIDGO's pick is fastest when there was nothing to beat", () => {
    // "Fastest" against no alternatives is not true, however flattering.
    const line = reasonLine({
      reason: RANKED[0],
      distanceMeters: null,
      alternativesCount: 0,
      subcategoryName: "Flyers",
    });
    expect(line).toContain("The only printer GRIDGO can put flyers on today");
    expect(line).not.toContain("Fastest");
  });

  it("never names or counts shops — GRIDGO is who the client is buying from", () => {
    const lines = [
      reasonLine({ reason: RANKED[0], distanceMeters: null, alternativesCount: 0, subcategoryName: "Flyers" }),
      reasonLine({ reason: RANKED[0], distanceMeters: null, alternativesCount: 4, subcategoryName: "Flyers" }),
      reasonLine({ reason: reason({ factor: "quality", rank: 1 }), distanceMeters: null, alternativesCount: 4, subcategoryName: "Flyers" }),
      reasonLine({ reason: reason({ factor: "distance", rank: 1 }), distanceMeters: 1400, alternativesCount: 4, subcategoryName: "Flyers" }),
      reasonLine({ reason: null, distanceMeters: null, alternativesCount: 4, subcategoryName: "Flyers" }),
    ];
    for (const line of lines) expect(line.toLowerCase()).not.toMatch(/\bshops?\b/);
  });

  it("explains a bundle as the one job it keeps the order to", () => {
    expect(
      reasonLine({
        reason: reason({ factor: "bundle", rank: 0 }),
        distanceMeters: null,
        alternativesCount: 4,
        subcategoryName: "Flyers",
      }),
    ).toContain("travels as one job");
  });
});

describe("queueLine", () => {
  it("puts the client one past whoever is in front", () => {
    expect(queueLine({ jobsAhead: 2, estimatedHours: 96 })).toBe("3rd in line");
    expect(queueLine({ jobsAhead: 0, estimatedHours: 48 })).toBe("Next in line");
  });

  it("says nothing at all when the match carried no queue", () => {
    expect(queueLine(null)).toBeNull();
    expect(queueLine(undefined)).toBeNull();
  });
});

describe("ordinal", () => {
  it("handles the teens, which is where every naive version breaks", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
    ]);
  });
});

describe("matchDistanceMeters", () => {
  const shop = { supplierId: "s", shopName: "Shop", shop: { lat: 7.0731, lng: 125.6128, label: "Bajada" }, media: [], categories: [], services: [] };

  it("measures from the shop's own pin", () => {
    const metres = matchDistanceMeters({ shop }, { lat: 7.076, lng: 125.615 });
    expect(metres).toBeGreaterThan(0);
    expect(metres).toBeLessThan(1000);
  });

  it("has no distance when the client gave no drop-off", () => {
    // Distance did not enter the match either, so there is nothing to show.
    expect(matchDistanceMeters({ shop }, null)).toBeNull();
    expect(matchDistanceMeters({ shop: { ...shop, shop: null } }, { lat: 7, lng: 125 })).toBeNull();
  });
});

describe("reasonLine and other shops", () => {
  it("does not send the client looking for another shop", () => {
    const line = reasonLine({
      reason: RANKED[0],
      distanceMeters: null,
      alternativesCount: 4,
      subcategoryName: "Flyers",
    });
    expect(line.toLowerCase()).not.toMatch(/another shop|next shop|shops open to you|of the \d+ shops/);
  });
});
