/**
 * How big the thing is, in the client's words and in GRIDGO's integers.
 *
 * A shop can price by the piece, the pack, the page, the square foot, the
 * running foot, or the whole job. Three of those need a number from the client
 * before anything can be priced at all, and this is where that question is
 * asked and answered.
 *
 * The arithmetic mirrors `src/pricing.js` in gridgo-api deliberately: the sheet
 * shows a total before the basket exists, and a sheet that computes it any
 * other way is a price the client sees and does not pay. Where the two could
 * drift — a shop's minimum billable size, a volume break — this follows the
 * server's rules rather than simplifying them.
 *
 * Everything is thousandths of the listing's own `measureUnit`, so 3.5 ft is
 * 3500 and no float ever reaches a price.
 */

import type {
  CatalogItem,
  CatalogPriceTier,
  LineMeasurement,
  MeasurementKind,
  MeasureUnit,
} from "@/lib/api";

const MILLI = 1000;

/** What a shop's unit is called next to a number the client typed. */
const UNIT_WORDS: Record<MeasureUnit, { one: string; many: string; square: string }> = {
  mm: { one: "mm", many: "mm", square: "sq mm" },
  cm: { one: "cm", many: "cm", square: "sq cm" },
  in: { one: "inch", many: "inches", square: "sq in" },
  ft: { one: "foot", many: "feet", square: "sq ft" },
  m: { one: "metre", many: "metres", square: "sq m" },
};

export function unitWord(unit: MeasureUnit | null, plural = true): string {
  if (!unit) return "";
  return plural ? UNIT_WORDS[unit].many : UNIT_WORDS[unit].one;
}

export function squareUnitWord(unit: MeasureUnit | null): string {
  return unit ? UNIT_WORDS[unit].square : "";
}

/** What this listing has to ask. Falls back from the field to the unit. */
export function measurementKind(item: CatalogItem): MeasurementKind {
  if (item.measurementKind) return item.measurementKind;
  if (item.pricingUnit === "per_area") return "area";
  if (item.pricingUnit === "per_length") return "length";
  if (item.pricingUnit === "per_page") return "pages";
  return "none";
}

/** What the client is asked, in their own terms rather than the unit's name. */
export function measurementPrompt(kind: MeasurementKind, unit: MeasureUnit | null): string {
  switch (kind) {
    case "area":
      return `How big is it, in ${unitWord(unit)}?`;
    case "length":
      return `How long is it, in ${unitWord(unit)}?`;
    case "pages":
      return "How many pages?";
    case "none":
      return "";
  }
}

/**
 * A typed number as thousandths.
 *
 * "3.5" is 3500 and "3.5001" is 3500 too — a shop that bills in feet does not
 * bill in ten-thousandths of one, and rounding here is what keeps the number
 * the client sees the number they are charged for.
 *
 * Null for anything that is not a positive number, which is the same answer
 * for an empty field and for "abc": neither is a size.
 */
export function toMilli(text: string): number | null {
  const value = Number.parseFloat(text.trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  const milli = Math.round(value * MILLI);
  return milli > 0 ? milli : null;
}

/** Thousandths back to the number a person typed, without trailing zeroes. */
export function fromMilli(milli: number | null | undefined): string {
  if (milli == null) return "";
  return String(Math.round(milli) / MILLI);
}

/** The draft a measurement field set holds while it is being filled in. */
export type MeasurementDraft = { width: string; height: string; length: string; pages: string };

export const EMPTY_MEASUREMENT: MeasurementDraft = { width: "", height: "", length: "", pages: "" };

/** A draft as the shape the platform bills from, or null while incomplete. */
export function toMeasurement(
  kind: MeasurementKind,
  draft: MeasurementDraft,
): LineMeasurement | null {
  if (kind === "none") return null;
  if (kind === "pages") {
    const pages = Number.parseInt(draft.pages.trim(), 10);
    return Number.isSafeInteger(pages) && pages > 0 ? { pages } : null;
  }
  if (kind === "length") {
    const length = toMilli(draft.length);
    return length == null ? null : { length };
  }
  // Width and height are one measurement, not two. Half of an area is not a
  // smaller area, it is no area, and the platform refuses it as such.
  const width = toMilli(draft.width);
  const height = toMilli(draft.height);
  return width == null || height == null ? null : { width, height };
}

/** A stored measurement back into the fields it was typed in. */
export function toDraft(measurement: LineMeasurement | null | undefined): MeasurementDraft {
  return {
    width: fromMilli(measurement?.width),
    height: fromMilli(measurement?.height),
    length: fromMilli(measurement?.length),
    pages: measurement?.pages == null ? "" : String(measurement.pages),
  };
}

/**
 * Whether this listing can be added to a basket yet.
 *
 * A listing that needs no measurement is always complete. `toMeasurement`
 * returns null for it — correctly, there is nothing to send — so asking that
 * function alone would block every ordinary flyer.
 */
export function isMeasurementComplete(item: CatalogItem, draft: MeasurementDraft): boolean {
  const kind = measurementKind(item);
  return kind === "none" || toMeasurement(kind, draft) != null;
}

/**
 * Whether the shop's minimum billable size is doing the charging.
 *
 * Worth saying out loud. A client ordering a 1x4 banner from a shop with a 2x4
 * minimum is paying for 2x4, and finding that out from the total alone reads
 * as a bug rather than as the shop's rule.
 */
export function minimumApplies(item: CatalogItem, measurement: LineMeasurement | null): boolean {
  if (!measurement) return false;
  const kind = measurementKind(item);
  if (kind === "area") {
    if (item.minimumWidthMilli == null || item.minimumHeightMilli == null) return false;
    const asked = (measurement.width ?? 0) * (measurement.height ?? 0);
    return asked < item.minimumWidthMilli * item.minimumHeightMilli;
  }
  if (kind === "length") {
    if (item.minimumLengthMilli == null) return false;
    return (measurement.length ?? 0) < item.minimumLengthMilli;
  }
  return false;
}

/** "3 × 5 ft · 15 sq ft" — what the client asked for, and what it comes to. */
export function measurementSummary(
  item: CatalogItem,
  measurement: LineMeasurement | null,
): string | null {
  if (!measurement) return null;
  const kind = measurementKind(item);
  const unit = item.measureUnit;
  if (kind === "pages") {
    const pages = measurement.pages ?? 0;
    return `${pages} ${pages === 1 ? "page" : "pages"}`;
  }
  if (kind === "length") {
    return `${fromMilli(measurement.length)} ${unitWord(unit)}`;
  }
  if (kind === "area") {
    const area = ((measurement.width ?? 0) / MILLI) * ((measurement.height ?? 0) / MILLI);
    const rounded = Math.round(area * 100) / 100;
    return `${fromMilli(measurement.width)} × ${fromMilli(measurement.height)} ${unitWord(unit)} · ${rounded} ${squareUnitWord(unit)}`;
  }
  return null;
}

/**
 * How many billable units this line comes to, in thousandths.
 *
 * The same scale for every pricing unit, which is what lets one multiplication
 * price all six. Mirrors `billableUnits` in gridgo-api, minimum billable size
 * included — the minimum applies to the measurement before quantity, so two
 * small banners are two minimums rather than one.
 */
export function billableUnitsMilli(
  item: CatalogItem,
  quantity: number,
  measurement: LineMeasurement | null,
): number | null {
  const count = Math.max(1, Math.floor(quantity));
  switch (item.pricingUnit) {
    case "whole_job":
      return MILLI;
    case "per_unit":
    case "per_package":
      return count * MILLI;
    case "per_page": {
      const pages = measurement?.pages;
      return pages && pages > 0 ? pages * count * MILLI : null;
    }
    case "per_area": {
      const width = measurement?.width;
      const height = measurement?.height;
      if (!width || !height) return null;
      let area = width * height;
      if (item.minimumWidthMilli != null && item.minimumHeightMilli != null) {
        const floor = item.minimumWidthMilli * item.minimumHeightMilli;
        if (area < floor) area = floor;
      }
      // Area is unit-squared in thousandths; bring it back to one factor so
      // every unit leaves here on the same scale.
      return Math.round((area * count) / MILLI);
    }
    case "per_length": {
      let length = measurement?.length;
      if (!length) return null;
      if (item.minimumLengthMilli != null && length < item.minimumLengthMilli) {
        length = item.minimumLengthMilli;
      }
      return length * count;
    }
    default:
      return null;
  }
}

/**
 * The rate this line is charged at, before options.
 *
 * A volume break replaces the base rate outright from a quantity up — it is
 * not a discount applied afterwards, which is why it is chosen here rather
 * than subtracted later.
 */
export function effectiveRateMinor(item: CatalogItem, quantity: number, baseMinor: number): number {
  const tiers: CatalogPriceTier[] = item.priceTiers ?? [];
  const count = Math.max(1, Math.floor(quantity));
  const reached = tiers
    .filter((tier) => count >= tier.minQuantity)
    .sort((left, right) => right.minQuantity - left.minQuantity)[0];
  return reached ? reached.unitPriceMinor : baseMinor;
}

/**
 * What this line costs, or null while the sheet cannot know.
 *
 * Null is a real answer and must be drawn as one: a measured listing with no
 * measurement yet has no price, and a zero in its place reads as free.
 */
export function lineTotalMinor(
  item: CatalogItem,
  quantity: number,
  measurement: LineMeasurement | null,
  unitPriceMinor: number,
): number | null {
  const units = billableUnitsMilli(item, quantity, measurement);
  if (units == null) return null;
  const optionsDelta = unitPriceMinor - item.basePriceMinor;
  const rate = effectiveRateMinor(item, quantity, item.basePriceMinor) + optionsDelta;
  return Math.round((Math.max(0, rate) * units) / MILLI);
}

/** The least a shop will run, when the client is under it. */
export function belowMinimumOrder(item: CatalogItem, quantity: number): number | null {
  const minimum = item.minimumOrderQuantity;
  if (minimum == null || quantity >= minimum) return null;
  return minimum;
}
