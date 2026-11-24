import { ApiError, type DeliveryFeeBand, type ExpressShop } from "@/lib/api";
import {
  apiErrorCode,
  fareLimitOptions,
  payCountdown,
  printerChoiceMissing,
  printerStatus,
  reachLine,
  selectableFirst,
  shopPrintingPrice,
  sortOptions,
  usesShopPrices,
  validSort,
  walkLine,
  widenedLine,
  zoneLine,
} from "@/lib/whoPrints";

/** The bands as GRIDGO's settings send them; the screen reads every figure from here. */
const BANDS: DeliveryFeeBand[] = [
  { zone: "nearby", label: "Nearby", maxDistanceMeters: 5000, feeMinor: 8900 },
  { zone: "away", label: "Away", maxDistanceMeters: 10000, feeMinor: 14900 },
  { zone: "long_distance", label: "Long distance", maxDistanceMeters: 15000, feeMinor: 22900 },
  { zone: "out_of_zone", label: "Out of zone", maxDistanceMeters: null, baseFeeMinor: 22900, perKmMinor: 1500 },
];

function card(overrides: Partial<ExpressShop> = {}): ExpressShop {
  return {
    supplierId: "shop_1",
    catalogItemIds: ["item_1"],
    name: "Corner Print",
    address: "Davao",
    location: { lat: 7.07, lng: 125.61 },
    distanceMeters: 1200,
    rating: null,
    jobsAhead: 0,
    readyAt: "2026-11-24T06:00:00.000Z",
    isNew: false,
    busy: false,
    printerType: "shop",
    verificationLevel: "verified",
    isOpenNow: true,
    selectable: true,
    openStatus: "open",
    zone: { code: "A", key: "nearby", label: "Nearby" },
    deliveryFeeMinor: 8900,
    deliveryFareMinor: 8900,
    walkingTimeMinutes: null,
    barangay: null,
    distanceApproximate: false,
    quote: null,
    paymentTiming: "checkout",
    ...overrides,
  };
}

describe("Just print it fare limits", () => {
  it("reads the Nearby fare from the bands, never a constant", () => {
    const options = fareLimitOptions(BANDS, "delivery");
    expect(options.map((option) => option.value)).toEqual(["nearby", "up_to_149", "any"]);
    expect(options[0].detail).toBe("₱89 fare");
    expect(options[1].label).toBe("Up to ₱149");
    expect(options[1].detail).toBe("Nearby or Away");

    const edited = fareLimitOptions([{ ...BANDS[0], feeMinor: 9900 }, ...BANDS.slice(1)], "delivery");
    expect(edited[0].detail).toBe("₱99 fare");
    const odd = fareLimitOptions([{ ...BANDS[0], feeMinor: 8950 }, ...BANDS.slice(1)], "delivery");
    expect(odd[0].detail).toBe("₱89.50 fare");
  });

  it("says distance, not a fare, when picking up", () => {
    const options = fareLimitOptions(BANDS, "pickup");
    expect(options.map((option) => option.label)).toEqual(["Nearby", "A bit farther", "Anywhere"]);
    expect(options[0].detail).toBe("Within 5 km");
    expect(options[1].detail).toBe("Nearby or Away");
  });

  it("still offers three limits on an API with unnamed bands", () => {
    const options = fareLimitOptions([], "delivery");
    expect(options).toHaveLength(3);
    expect(options[0].detail).toBe("Closest zone");
  });
});

describe("widening", () => {
  it("names the zones added and their fares", () => {
    expect(widenedLine({ expandedZones: ["B"], fareBands: BANDS }, "delivery")).toBe(
      "Fewer than 3 printers are open nearby, so Away (₱149.00) is shown too.",
    );
    expect(widenedLine({ expandedZones: ["B", "C"], fareBands: BANDS }, "delivery")).toBe(
      "Fewer than 3 printers are open nearby, so Away (₱149.00) and Long distance (₱229.00) are shown too.",
    );
  });

  it("leaves fares out for pickup, and says nothing when nothing was added", () => {
    expect(widenedLine({ expandedZones: ["B", "C"], fareBands: BANDS }, "pickup")).toBe(
      "Fewer than 3 printers are open nearby, so Away and Long distance are shown too.",
    );
    expect(widenedLine({ expandedZones: [], fareBands: BANDS }, "pickup")).toBeNull();
  });
});

describe("printer cards", () => {
  it("reads open, night and closed, and never enables a card from its open label", () => {
    expect(printerStatus(card(), "pickup")).toEqual({ label: "Open now", tone: "success" });
    expect(printerStatus(card({ openStatus: "night" }), "pickup").label).toBe("Open tonight");
    expect(printerStatus(card({ openStatus: "closed", isOpenNow: false, selectable: false }), "pickup").label).toBe("Closed");
    // Open, but outside rider hours: no delivery from it right now.
    expect(printerStatus(card({ selectable: false }), "delivery").label).toBe("Open · no delivery now");
  });

  it("shows the delivery fare for delivery and the walk for pickup", () => {
    expect(reachLine(card(), "delivery")).toBe("₱89.00 delivery");
    expect(reachLine(card({ walkingTimeMinutes: 15, deliveryFeeMinor: null }), "pickup")).toBe("About 15 min walk");
    expect(walkLine(75)).toBe("About 1 h 15 min walk");
    expect(walkLine(null)).toBeNull();
  });

  it("names the zone letter and word", () => {
    expect(zoneLine(card())).toBe("Zone A · Nearby");
    expect(zoneLine(card({ zone: { code: null, key: "out_of_zone", label: "Out of zone" } }))).toBe("Out of zone");
    expect(zoneLine(card({ zone: null }))).toBeNull();
  });

  it("shows a shop's own price only for A3", () => {
    const quote = { clientItemSubtotalMinor: 12_000 } as ExpressShop["quote"];
    expect(shopPrintingPrice(card({ quote, paymentTiming: "checkout" }))).toBeNull();
    expect(shopPrintingPrice(card({ quote, paymentTiming: "after_acceptance" }))).toBe(12_000);
  });

  it("puts choosable cards first, keeping the server's order within each", () => {
    const rows = [
      card({ supplierId: "closed", selectable: false }),
      card({ supplierId: "a" }),
      card({ supplierId: "b" }),
    ];
    expect(selectableFirst(rows).map((row) => row.supplierId)).toEqual(["a", "b", "closed"]);
  });
});

describe("sorts", () => {
  it("offers Lowest price only for A3", () => {
    expect(sortOptions(false).map((option) => option.label)).toEqual(["Nearby", "All Davao", "Fastest", "Top rated"]);
    expect(sortOptions(true).map((option) => option.value)).toContain("lowest_price");
    expect(validSort("lowest_price", false)).toBe("nearby");
    expect(validSort("lowest_price", true)).toBe("lowest_price");
    expect(usesShopPrices([{ paper: "a4" }, { paper: "a3" }])).toBe(true);
    expect(usesShopPrices([{ paper: "a4" }])).toBe(false);
  });
});

describe("API answers", () => {
  it("treats a missing route as no printer choice, and nothing else", () => {
    expect(printerChoiceMissing(new ApiError(404, { error: "not_found" }))).toBe(true);
    expect(printerChoiceMissing(new ApiError(405, {}))).toBe(true);
    expect(printerChoiceMissing(new ApiError(404, { error: "order_not_found" }))).toBe(false);
    expect(printerChoiceMissing(new ApiError(400, { error: "invalid_express_files" }))).toBe(false);
    expect(printerChoiceMissing(new Error("offline"))).toBe(false);
  });

  it("reads the refusal code an ApiError carries", () => {
    expect(apiErrorCode(new ApiError(409, { error: "express_preview_required" }))).toBe("express_preview_required");
    expect(apiErrorCode({ code: "legacy" })).toBe("legacy");
    expect(apiErrorCode(null)).toBeNull();
  });
});

describe("A3 payment window", () => {
  it("counts down to payBy and stops at zero", () => {
    const now = Date.parse("2026-11-24T05:00:00.000Z");
    expect(payCountdown("2026-11-24T05:05:00.000Z", now)).toEqual({ label: "5:00", seconds: 300 });
    expect(payCountdown("2026-11-24T05:00:01.500Z", now)?.label).toBe("0:02");
    expect(payCountdown("2026-11-24T05:00:00.000Z", now)).toBeNull();
    expect(payCountdown(null, now)).toBeNull();
  });
});
