/**
 * Whether the artwork is sharp enough for the thing being printed.
 *
 * This is the question the artwork step exists to answer, and until now it was
 * being guessed at from the file's byte count: a 38 KB JPEG was called "small
 * for print" because small files are usually screen exports. That is a proxy,
 * and it is wrong in both directions — a heavily compressed 300 DPI photograph
 * is small, and a bloated screenshot is not.
 *
 * GRIDGO now reads the real pixel dimensions out of the upload, and the client
 * has already chosen a size, so the actual answer is available: pixels divided
 * by inches is the resolution it will print at. 540 x 720 pixels on A5 is 93
 * DPI whatever the file weighs.
 *
 * The threshold is not one number, because it depends on how far away the
 * thing is read from. A flyer is held; a tarpaulin is seen across a car park,
 * and nobody prints one at 300 DPI. Large format is judged at its own
 * standard rather than failed against a leaflet's.
 */

const MILLI = 1000;
const MM_PER_INCH = 25.4;

/** Named paper, portrait, in whole millimetres. */
const NAMED_SIZES: Record<string, { width: number; height: number }> = {
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
export function physicalSizeMilli(label: string): { width: number; height: number } | null {
  const text = label.trim().toLowerCase();
  if (!text) return null;

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
 * What this size of job is normally printed at.
 *
 * Anything over about two feet on its long side is large format and is read
 * from a distance, so the trade prints it at around 100 DPI. Holding-distance
 * work — flyers, cards, menus — wants 300.
 */
export function targetDpi(sizeMilli: { width: number; height: number }): number {
  const longest = Math.max(sizeMilli.width, sizeMilli.height);
  return longest > 600 * MILLI ? 100 : 300;
}

export type PrintResolution = {
  /** The resolution this file will actually print at, at the chosen size. */
  dpi: number;
  /** What this size of job is normally printed at. */
  target: number;
  verdict: "good" | "workable" | "low";
  /** One sentence naming the number and what to do about it. */
  message: string;
};

/**
 * The resolution an upload will print at, at the size the client chose.
 *
 * Judged on the limiting side rather than an average. Artwork that is generous
 * across and thin down prints as thin: the short side is what shows.
 */
export function printResolution(
  pixels: { width: number; height: number } | null,
  sizeMilli: { width: number; height: number } | null,
): PrintResolution | null {
  if (!pixels?.width || !pixels?.height || !sizeMilli) return null;

  // Compare like with like. A landscape file on a portrait size is a
  // separate warning the fit check already makes; here it must not also
  // produce a resolution figure ten times off.
  const pixelLong = Math.max(pixels.width, pixels.height);
  const pixelShort = Math.min(pixels.width, pixels.height);
  const sizeLong = Math.max(sizeMilli.width, sizeMilli.height) / MILLI / MM_PER_INCH;
  const sizeShort = Math.min(sizeMilli.width, sizeMilli.height) / MILLI / MM_PER_INCH;
  if (!(sizeLong > 0) || !(sizeShort > 0)) return null;

  const dpi = Math.round(Math.min(pixelLong / sizeLong, pixelShort / sizeShort));
  const target = targetDpi(sizeMilli);

  if (dpi >= target) {
    return {
      dpi,
      target,
      verdict: "good",
      message: `At ${dpi} DPI this prints sharp at that size.`,
    };
  }
  // Half the target is the line the trade draws between "softer than ideal"
  // and "visibly blocky". Below it the client should send another file; above
  // it they are making a judgement call and are entitled to make it.
  if (dpi >= target / 2) {
    return {
      dpi,
      target,
      verdict: "workable",
      message:
        `At ${dpi} DPI this prints a little soft at that size. ` +
        `${target} DPI is what this size is normally printed at — it will still run.`,
    };
  }
  return {
    dpi,
    target,
    verdict: "low",
    message:
      `At ${dpi} DPI this will look blocky at that size. ` +
      `Send the version exported for print — around ${target} DPI — or choose a smaller size.`,
  };
}

/** The pixels a bigger file would need to reach the target at that size. */
export function pixelsNeeded(
  sizeMilli: { width: number; height: number } | null,
): { width: number; height: number } | null {
  if (!sizeMilli) return null;
  const target = targetDpi(sizeMilli);
  return {
    width: Math.round((sizeMilli.width / MILLI / MM_PER_INCH) * target),
    height: Math.round((sizeMilli.height / MILLI / MM_PER_INCH) * target),
  };
}
