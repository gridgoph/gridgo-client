import type { CatalogItem } from "@/lib/api";
import {
  EMPTY_MEASUREMENT,
  belowMinimumOrder,
  billableUnitsMilli,
  effectiveRateMinor,
  isMeasurementComplete,
  lineTotalMinor,
  measurementKind,
  measurementSummary,
  minimumApplies,
  toDraft,
  toMeasurement,
  toMilli,
} from "@/lib/measurement";

function listing(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "item_1",
    supplierId: "shop_1",
    supplierServiceId: "svc_1",
    categoryCode: "signage",
    subcategoryCode: "tarpaulin",
    name: "Tarpaulin",
    description: null,
    basePriceMinor: 2_500,
    fromPriceMinor: 2_500,
    effectivePriceMinor: 2_500,
    pricingUnit: "per_unit",
    packageQty: null,
    measurementKind: "none",
    measureUnit: null,
    minimumWidthMilli: null,
    minimumHeightMilli: null,
    minimumLengthMilli: null,
    minimumOrderQuantity: null,
    priceTiers: [],
    speedTiers: [],
    pricingBasis: "per_unit",
    turnaroundMode: "inherit",
    turnaroundHours: 48,
    rush: null,
    acceptedFormats: [],
    photos: [],
    prepSteps: [],
    optionGroups: [],
    version: 1,
    serviceVersion: 1,
    ...overrides,
  } as CatalogItem;
}

const tarpaulin = listing({
  pricingUnit: "per_area",
  measurementKind: "area",
  measureUnit: "ft",
  minimumWidthMilli: 2_000,
  minimumHeightMilli: 4_000,
});

describe("reading a typed measurement", () => {
  it("takes a decimal as thousandths", () => {
    expect(toMilli("3.5")).toBe(3_500);
    expect(toMilli(" 12 ")).toBe(12_000);
  });

  it("refuses anything that is not a size", () => {
    // An empty field and "abc" get the same answer, because neither is a size.
    expect(toMilli("")).toBeNull();
    expect(toMilli("abc")).toBeNull();
    expect(toMilli("0")).toBeNull();
    expect(toMilli("-4")).toBeNull();
  });

  it("keeps a width and a height together", () => {
    // Half of an area is not a smaller area, it is no area.
    expect(toMeasurement("area", { ...EMPTY_MEASUREMENT, width: "3" })).toBeNull();
    expect(toMeasurement("area", { ...EMPTY_MEASUREMENT, width: "3", height: "5" })).toEqual({
      width: 3_000,
      height: 5_000,
    });
  });

  it("round-trips a stored measurement back into its fields", () => {
    expect(toDraft({ width: 3_500, height: 5_000 })).toEqual({
      width: "3.5",
      height: "5",
      length: "",
      pages: "",
    });
  });

  it("takes pages as a whole count, not a measurement", () => {
    expect(toMeasurement("pages", { ...EMPTY_MEASUREMENT, pages: "10" })).toEqual({ pages: 10 });
    expect(toMeasurement("pages", { ...EMPTY_MEASUREMENT, pages: "1.5" })).toEqual({ pages: 1 });
    expect(toMeasurement("pages", { ...EMPTY_MEASUREMENT, pages: "0" })).toBeNull();
  });

  it("asks for nothing on a listing priced by the piece", () => {
    expect(measurementKind(listing())).toBe("none");
    expect(isMeasurementComplete(listing(), EMPTY_MEASUREMENT)).toBe(true);
  });
});

describe("the total the sheet shows", () => {
  it("matches the platform on a 3x5 at PHP 25 a square foot", () => {
    // 15 square feet at PHP 25. The same figure gridgo-api's own test asserts.
    const total = lineTotalMinor(tarpaulin, 1, { width: 3_000, height: 5_000 }, 2_500);
    expect(total).toBe(37_500);
  });

  it("charges the shop's minimum when the job is under it", () => {
    // A 1x4 banner wastes the same sheet as a 2x4, so 8 square feet is billed.
    const total = lineTotalMinor(tarpaulin, 1, { width: 1_000, height: 4_000 }, 2_500);
    expect(total).toBe(20_000);
    expect(minimumApplies(tarpaulin, { width: 1_000, height: 4_000 })).toBe(true);
    expect(minimumApplies(tarpaulin, { width: 3_000, height: 5_000 })).toBe(false);
  });

  it("applies the minimum per item, not once for the order", () => {
    // Two small banners are two wasted sheets.
    const total = lineTotalMinor(tarpaulin, 2, { width: 1_000, height: 4_000 }, 2_500);
    expect(total).toBe(40_000);
  });

  it("bills pages times copies, which are two different numbers", () => {
    const booklet = listing({ pricingUnit: "per_page", measurementKind: "pages", basePriceMinor: 300 });
    expect(lineTotalMinor(booklet, 3, { pages: 10 }, 300)).toBe(9_000);
  });

  it("shows nothing rather than zero while a measurement is missing", () => {
    // A zero in the price line reads as free, and this listing is not free —
    // it is unpriceable until the client says how big it is.
    expect(lineTotalMinor(tarpaulin, 1, null, 2_500)).toBeNull();
    expect(billableUnitsMilli(tarpaulin, 1, null)).toBeNull();
  });

  it("prices a whole-job listing once, whatever the quantity", () => {
    const pkg = listing({ pricingUnit: "whole_job", basePriceMinor: 540_000 });
    expect(lineTotalMinor(pkg, 1, null, 540_000)).toBe(540_000);
    expect(lineTotalMinor(pkg, 4, null, 540_000)).toBe(540_000);
  });

  it("lets a volume break replace the rate rather than discount it", () => {
    // Jopal drops mugs from PHP 100 to PHP 60 at 250. The break is the rate
    // from there up, not a percentage taken off afterwards.
    const mugs = listing({
      basePriceMinor: 10_000,
      priceTiers: [{ minQuantity: 250, unitPriceMinor: 6_000 }],
    });
    expect(effectiveRateMinor(mugs, 249, 10_000)).toBe(10_000);
    expect(effectiveRateMinor(mugs, 250, 10_000)).toBe(6_000);
    expect(lineTotalMinor(mugs, 250, null, 10_000)).toBe(1_500_000);
  });

  it("carries an option's price through a break", () => {
    // The break replaces the base rate; an add-on the client chose still adds.
    const mugs = listing({
      basePriceMinor: 10_000,
      priceTiers: [{ minQuantity: 250, unitPriceMinor: 6_000 }],
    });
    expect(lineTotalMinor(mugs, 250, null, 11_500)).toBe(1_875_000);
  });
});

describe("what the client is shown about the size", () => {
  it("states the area as well as the two sides", () => {
    expect(measurementSummary(tarpaulin, { width: 3_000, height: 5_000 })).toBe(
      "3 × 5 feet · 15 sq ft",
    );
  });

  it("names a length in the shop's own unit", () => {
    const banner = listing({
      pricingUnit: "per_length",
      measurementKind: "length",
      measureUnit: "m",
    });
    expect(measurementSummary(banner, { length: 2_500 })).toBe("2.5 metres");
  });

  it("says how many pages, singular where it is one", () => {
    const doc = listing({ pricingUnit: "per_page", measurementKind: "pages" });
    expect(measurementSummary(doc, { pages: 1 })).toBe("1 page");
    expect(measurementSummary(doc, { pages: 12 })).toBe("12 pages");
  });
});

describe("the least a shop will run", () => {
  it("names the minimum when the client is under it", () => {
    const shirts = listing({ minimumOrderQuantity: 12 });
    expect(belowMinimumOrder(shirts, 5)).toBe(12);
    expect(belowMinimumOrder(shirts, 12)).toBeNull();
    expect(belowMinimumOrder(listing(), 1)).toBeNull();
  });
});
