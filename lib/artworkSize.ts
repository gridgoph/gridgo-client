/**
 * The artwork against the size the client chose (gridgo-client#196).
 *
 * A warning, never a block. A client printing an A5 design on A4 with a border
 * is doing something deliberate, and a file can always be scaled; the far
 * commoner case is a phone screenshot sent for a flyer, and that is worth one
 * note before it is printed rather than after. So the note says what the
 * product needs, what the file is, what happens if it is sent anyway, and the
 * two ways on: a file that matches, or carry on knowing it will be scaled.
 *
 * An image is judged on its pixels, never on the millimetres its declared
 * density works out to. A JPEG exported for A4 at 2480 × 3508 that still says
 * "72 DPI" in its header is a perfect A4 file and 875 mm tall on paper, and
 * calling that a mismatch is a warning that teaches clients to ignore
 * warnings. A PDF is judged on its page box, because that is a size.
 *
 * Orientation never counts against a file: "A4" says nothing about which way
 * up, and turning a design is free.
 */

import type { DetectedArtwork } from "@/lib/api";
import { trimRatio } from "@/lib/listing";
import { pixelsNeeded, printResolution } from "@/lib/printResolution";

type Dimensions = { width: number; height: number };

/**
 * How far the shape may drift before it shows on the sheet. Covers bleed and
 * rounding: a 3 mm bleed on A5 moves the proportion by about 2%.
 */
const SHAPE_TOLERANCE = 0.05;

/** A PDF page this close to the product, on each side, is the product. */
const PAGE_TOLERANCE_MILLI = 2_000;

const MILLI = 1000;

export type ArtworkSizeNote = {
  /** What the product needs: "A4 · 210 × 297 mm · about 2480 × 3508 pixels". */
  needs: string;
  /** What the file is: "720 × 1600 pixels", or a PDF's page in millimetres. */
  file: string;
  /** What happens if it is sent as it is, then the two ways on. */
  message: string;
};

const WAYS_ON = "Upload a file that matches, or carry on and it will be printed scaled to fit.";
const CROP = "part of the design may be cut off, or a white border left";

/**
 * The note for one file on one line, or null when there is nothing to say.
 *
 * Null as well wherever either half is unknown — a custom size nobody has
 * measured, a file that stated nothing — because a confident note about a
 * size GRIDGO invented is worse than none.
 */
export function artworkSizeNote(input: {
  detected: DetectedArtwork | null | undefined;
  /** Pixels measured on the phone, for a file GRIDGO could not read. */
  pixels?: Dimensions | null;
  /** The ordered size, in thousandths of a millimetre. */
  sizeMilli: Dimensions | null;
  /** The size as the client picked it ("A4", "3 × 6 ft"); empty on a measured line. */
  label: string;
}): ArtworkSizeNote | null {
  const { detected, sizeMilli } = input;
  const label = tidyLabel(input.label);
  const target = sizeMilli ? ratio(sizeMilli) : trimRatio(input.label);
  if (target == null) return null;

  if (detected?.kind === "pdf") {
    if (!sizeMilli || !detected.widthMilli || !detected.heightMilli) return null;
    const page = { width: detected.widthMilli, height: detected.heightMilli };
    if (samePage(page, sizeMilli)) return null;
    const shapeOff = shapeDrift(ratio(page), target) > SHAPE_TOLERANCE;
    return {
      needs: describeProduct(label, sizeMilli, page, null),
      file: `${physicalWords(page)} page`,
      message:
        (shapeOff
          ? `The page is a different size and shape, so it will be scaled to fit: ${CROP}. `
          : "The page is a different size, so it will be scaled to fit. ") + WAYS_ON,
    };
  }

  const pixels = filePixels(detected, input.pixels);
  if (!pixels) return null;

  const shapeOff = shapeDrift(ratio(pixels), target) > SHAPE_TOLERANCE;
  // "Workable" softness is the upload card's quiet line, not a mismatch: the
  // file still matches, it just prints a little soft.
  const blurry = printResolution(pixels, sizeMilli)?.verdict === "low";
  if (!shapeOff && !blurry) return null;

  const effect =
    shapeOff && blurry
      ? `It is a different shape and has too few pixels for this size, so it will be scaled to fit: ${CROP}, and it will print blurry.`
      : shapeOff
        ? `It is a different shape, so it will be scaled to fit: ${CROP}.`
        : "It has too few pixels for this size, so it will be enlarged to fit and print blurry.";

  return {
    needs: describeProduct(label, sizeMilli, pixels, pixelsNeeded(sizeMilli)),
    file: `${pixels.width} × ${pixels.height} pixels`,
    message: `${effect} ${WAYS_ON}`,
  };
}

/** The image's pixels: GRIDGO's reading first, the phone's measurement after. */
function filePixels(
  detected: DetectedArtwork | null | undefined,
  measured: Dimensions | null | undefined,
): Dimensions | null {
  if (detected?.pixelWidth && detected.pixelHeight) {
    return { width: detected.pixelWidth, height: detected.pixelHeight };
  }
  if (measured?.width && measured.height) return measured;
  return null;
}

function ratio(size: Dimensions): number {
  return size.width / size.height;
}

/** Relative difference in shape, either way up. */
function shapeDrift(actual: number, target: number): number {
  const upright = Math.min(actual, 1 / actual);
  const targetUpright = Math.min(target, 1 / target);
  return Math.abs(upright - targetUpright) / targetUpright;
}

function samePage(page: Dimensions, product: Dimensions): boolean {
  const [pageShort, pageLong] = [page.width, page.height].sort((a, b) => a - b);
  const [short, long] = [product.width, product.height].sort((a, b) => a - b);
  return (
    Math.abs(pageShort - short) <= PAGE_TOLERANCE_MILLI &&
    Math.abs(pageLong - long) <= PAGE_TOLERANCE_MILLI
  );
}

/**
 * The product, turned the way the file is so the two rows compare like with
 * like: a landscape file beside "210 × 297 mm" reads as a second mismatch
 * that is not there.
 */
function describeProduct(
  label: string,
  sizeMilli: Dimensions | null,
  file: Dimensions,
  pixels: Dimensions | null,
): string {
  const turn = (size: Dimensions): Dimensions =>
    file.width !== file.height && file.width > file.height !== size.width > size.height
      ? { width: size.height, height: size.width }
      : size;
  const parts = [label];
  if (sizeMilli) parts.push(physicalWords(turn(sizeMilli)));
  if (pixels) {
    const needed = turn(pixels);
    parts.push(`about ${needed.width} × ${needed.height} pixels`);
  }
  return parts.filter(Boolean).join(" · ");
}

/** "210 × 297 mm"; centimetres once a side reaches a metre. */
function physicalWords(size: Dimensions): string {
  const unit = Math.max(size.width, size.height) >= 1000 * MILLI ? 10 : 1;
  const one = (milli: number) => Math.round(milli / MILLI / unit * 10) / 10;
  return `${one(size.width)} × ${one(size.height)} ${unit === 10 ? "cm" : "mm"}`;
}

/** "standard" → "Standard"; size codes arrive lower-case from some listings. */
function tidyLabel(label: string): string {
  const text = label.trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}
