/**
 * The physical size a line was ordered at, read from its size label or its
 * measurement, in thousandths of a millimetre.
 *
 * Used to compare a file's shape with the product (`lib/artworkSize.ts`) and
 * to say how many pixels the "Prepare your file" guide asks for. Whether a
 * file is sharp enough is GRIDGO's call, per product type
 * (`lib/artworkGuidance.ts`), never a threshold worked out here.
 */

const MILLI = 1000;

/** Named paper, portrait, in whole millimetres. */
const NAMED_SIZES: Record<string, { width: number; height: number }> = {
  a0: { width: 841, height: 1189 },
  a1: { width: 594, height: 841 },
  a2: { width: 420, height: 594 },
  a3: { width: 297, height: 420 },
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  a6: { width: 105, height: 148 },
  b5: { width: 176, height: 250 },
  dl: { width: 99, height: 210 },
  letter: { width: 216, height: 279 },
  legal: { width: 216, height: 356 },
  tabloid: { width: 279, height: 432 },
};

/**
 * Listing size codes that are not a paper name or a measured pair.
 * A shop writes "Standard" on a business card; the trim is still 3.5 × 2 in.
 */
const SIZE_ALIASES: Record<string, string> = {
  short: "8.5x11 in",
  long: "8.5x13 in",
  folio: "8.5x13 in",
  "30x40": "30x40 in",
};

const SUBCATEGORY_SIZE_ALIASES: Record<string, Record<string, string>> = {
  business_cards: { standard: "3.5x2 in" },
  posters_standees: { pullup: "85x200 cm" },
};

/** How many millimetres one of each unit the size labels use is worth. */
const UNIT_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  inch: 25.4,
  inches: 25.4,
  '"': 25.4,
  ft: 304.8,
  foot: 304.8,
  feet: 304.8,
};

/**
 * The physical size a label names, in thousandths of a millimetre.
 *
 * Handles the three shapes the size lists actually use: a paper name ("A5"),
 * that name with a qualifier ("A4 sheet"), and an explicit pair with a unit
 * ("90x50 mm", "3 × 6 ft"). Null for anything else — a custom size nobody has
 * measured is not a size this can reason about, and guessing one would produce
 * a confident resolution warning about a dimension GRIDGO invented.
 */
export function physicalSizeMilli(
  label: string,
  options?: { subcategoryCode?: string | null },
): { width: number; height: number } | null {
  const text = label.trim().toLowerCase();
  if (!text) return null;

  const subcategory = options?.subcategoryCode ?? "";
  const alias =
    SUBCATEGORY_SIZE_ALIASES[subcategory]?.[text] ?? SIZE_ALIASES[text];
  if (alias) return physicalSizeMilli(alias);

  // "A4 sheet", "A5" — the qualifier does not change the paper.
  const named = NAMED_SIZES[text.split(/\s+/)[0]];
  if (named) return { width: named.width * MILLI, height: named.height * MILLI };

  // "90x50 mm", "3 × 6 ft", "24 x 36 in". The unit may sit on either number
  // or only at the end, and when it sits on both they have to agree.
  const pair = text.match(
    /^(\d+(?:\.\d+)?)\s*([a-z"]*)\s*[x×]\s*(\d+(?:\.\d+)?)\s*([a-z"]*)/,
  );
  if (!pair) return null;
  const [, first, firstUnit, second, secondUnit] = pair;
  const unit = secondUnit || firstUnit;
  const scale = UNIT_MM[unit];
  if (!scale) return null;
  if (firstUnit && secondUnit && firstUnit !== secondUnit) return null;

  const width = Number(first) * scale * MILLI;
  const height = Number(second) * scale * MILLI;
  if (!(width > 0) || !(height > 0)) return null;
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * The physical size a *measured* line was ordered at.
 *
 * A tarpaulin billed by the square foot has no size label to read — the client
 * typed 3 by 5 feet instead of picking "A4".
 *
 * Converted to thousandths of a millimetre, the scale everything else here
 * uses, from the thousandths of the listing's own unit that the platform bills
 * in.
 */
export function measuredSizeMilli(
  measurement: { width?: number; height?: number } | null | undefined,
  measureUnit: string | null | undefined,
): { width: number; height: number } | null {
  if (!measurement?.width || !measurement?.height) return null;
  const scale = UNIT_MM[String(measureUnit ?? "").toLowerCase()];
  if (!scale) return null;
  return {
    width: Math.round(measurement.width * scale),
    height: Math.round(measurement.height * scale),
  };
}

/** A measured line's size as the client typed it: "3 × 6 ft". Null without both sides or a unit. */
export function measuredSizeLabel(
  measurement: { width?: number; height?: number } | null | undefined,
  measureUnit: string | null | undefined,
): string | null {
  if (!measurement?.width || !measurement?.height || !measureUnit) return null;
  const one = (thousandths: number) => Math.round(thousandths / 10) / 100;
  return `${one(measurement.width)} × ${one(measurement.height)} ${measureUnit}`;
}
