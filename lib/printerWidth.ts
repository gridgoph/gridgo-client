/**
 * How wide a tarpaulin printer goes, and whether the client's job fits it.
 *
 * A wide-format printer runs a roll of fixed width, so a shop listing under
 * Tarpaulin & Outdoor Banners states the widest thing its press prints
 * (`printerMaxWidthFeet`, a whole number of feet, 1–20). GRIDGO refuses a
 * wider job with `409 printer_cap_exceeded` when the line is added; this
 * module is how the client hears it first, in words, while they are still
 * typing the size.
 *
 * `requestedWidthFeet` mirrors `requestedWidthFeet` in gridgo-api
 * (`src/supplier-catalog.js`) — measurement first, then the size the chosen
 * options are bound to, then an option's own label, with the first number of
 * "4x8" read as the width. A copy that read the width any other way would warn
 * about jobs GRIDGO accepts, or wave through jobs it refuses.
 *
 * A listing with no cap, or a job with no stated width, is never refused, so
 * neither is ever warned about: no cap is "not published", not "zero".
 */

import type { CatalogItem, LineMeasurement, MeasureUnit } from "@/lib/api";
import type { ListingSelection } from "@/lib/listing";

const CAP_MIN_FEET = 1;
const CAP_MAX_FEET = 20;

const SIZE_WXH = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i;
const FEET_TEXT = /^(\d+(?:\.\d+)?)\s*(?:ft|feet|')?$/i;
const SIZE_BINDING_FIELDS = new Set(["size", "item_size", "dimensions"]);

/** Feet in one of each measure unit. */
const FEET_PER_UNIT: Record<MeasureUnit, number> = {
  ft: 1,
  in: 1 / 12,
  m: 1 / 0.3048,
  cm: 1 / 30.48,
  mm: 1 / 304.8,
};

/** The listing's cap in feet, or null when it has none GRIDGO would enforce. */
export function printerCapFeet(
  item: Pick<CatalogItem, "printerMaxWidthFeet"> | null | undefined,
): number | null {
  const cap = item?.printerMaxWidthFeet;
  return typeof cap === "number" && Number.isSafeInteger(cap) && cap >= CAP_MIN_FEET && cap <= CAP_MAX_FEET
    ? cap
    : null;
}

/** "Prints up to 7 ft wide", or null when the listing publishes no cap. */
export function printerCapLine(
  item: Pick<CatalogItem, "printerMaxWidthFeet"> | null | undefined,
): string | null {
  const cap = printerCapFeet(item);
  return cap == null ? null : `Prints up to ${cap} ft wide`;
}

/**
 * The widest cap among a match's listings — what the press behind it can do
 * at its best. Null when none of them publishes one.
 */
export function widestPrinterCapFeet(
  items: readonly Pick<CatalogItem, "printerMaxWidthFeet">[],
): number | null {
  const caps = items.map(printerCapFeet).filter((cap): cap is number => cap != null);
  return caps.length ? Math.max(...caps) : null;
}

/** A width in feet from "4x8", "5 ft", "5" or a number. Null for anything else. */
export function parseWidthFeet(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const match = text.match(SIZE_WXH) ?? text.match(FEET_TEXT);
  if (!match) return null;
  const width = Number(match[1]);
  return Number.isFinite(width) && width > 0 ? width : null;
}

/** Thousandths of the listing's unit, as feet. Null without a unit to read it in. */
function milliToFeet(milli: number | null | undefined, unit: MeasureUnit | null): number | null {
  if (milli == null || !Number.isFinite(milli) || milli <= 0 || !unit) return null;
  return (milli / 1000) * FEET_PER_UNIT[unit];
}

/**
 * How wide the client's job is, in feet, or null when they have not said.
 *
 * `sizeValue` is the size the chosen options are bound to — the same string the
 * sheet sends as `structuredSpec.size`.
 */
export function requestedWidthFeet(
  item: Pick<CatalogItem, "measureUnit" | "optionGroups">,
  measurement: LineMeasurement | null,
  selection: ListingSelection,
  sizeValue = "",
): number | null {
  const measured = milliToFeet(measurement?.width, item.measureUnit);
  if (measured != null) return measured;
  const fromSpec = parseWidthFeet(sizeValue);
  if (fromSpec != null) return fromSpec;
  const chosen = new Set(Object.values(selection));
  for (const group of item.optionGroups) {
    for (const option of group.options) {
      if (!chosen.has(option.id)) continue;
      const binding = option.specBinding;
      if (binding && SIZE_BINDING_FIELDS.has(binding.fieldCode)) {
        const bound = parseWidthFeet(binding.value ?? binding.valueCode);
        if (bound != null) return bound;
      }
      const labelled = parseWidthFeet(option.label);
      if (labelled != null) return labelled;
    }
  }
  return null;
}

/** "7", "3.5" — feet as a person writes them, never "3.2808398950131235". */
function feetWords(feet: number): string {
  return String(Math.round(feet * 100) / 100);
}

export type PrinterWidthProblem = {
  /** The short line: what is wrong. */
  title: string;
  /** What to do about it, with both numbers in it. */
  body: string;
  /** The one-line version for under the commit button. */
  short: string;
};

/**
 * What to tell a client whose job is wider than this printer, or null when it
 * fits, when the listing has no cap, or when no width has been given yet.
 *
 * A tarpaulin is printed across the roll, so turning it round is often the
 * whole fix — that is offered only when the other side actually fits.
 */
export function printerWidthProblem(
  item: Pick<CatalogItem, "printerMaxWidthFeet" | "measureUnit">,
  widthFeet: number | null,
  measurement: LineMeasurement | null = null,
): PrinterWidthProblem | null {
  const cap = printerCapFeet(item);
  if (cap == null || widthFeet == null || widthFeet <= cap) return null;
  const heightFeet = milliToFeet(measurement?.height, item.measureUnit);
  const turn =
    heightFeet != null && heightFeet <= cap
      ? ` Swap the width and height — ${feetWords(heightFeet)} ft wide fits — or make it ${cap} ft wide or less.`
      : ` Make it ${cap} ft wide or less.`;
  return {
    title: "Too wide for this printer",
    body: `This printer prints up to ${cap} ft wide, and yours is ${feetWords(widthFeet)} ft wide.${turn}`,
    short: `Too wide for this printer. Make it ${cap} ft wide or less first.`,
  };
}
