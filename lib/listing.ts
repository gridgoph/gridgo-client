/**
 * A shop's listing, as the client fills it in.
 *
 * The supplier app has a read-only preview of this exact sheet — sample, price,
 * press time, before-you-order, the numbered steps, then the add-ons (see
 * `app/shop/[id]/preview.tsx` in gridgo-supplier). This module is the same
 * reading with the boxes tickable: the shop wrote the sheet, the client answers
 * it, and the price moves as they do.
 *
 * Every number here comes from the listing payload. Nothing is defaulted,
 * guessed or averaged: a shop that has not priced an option does not have that
 * option, and a listing with a required group unanswered is not orderable yet.
 */

import {
  formatPhp,
  type AcceptedFormat,
  type CatalogItem,
  type CatalogOption,
  type CatalogOptionGroup,
  type CatalogPhoto,
  type LineMeasurement,
} from "@/lib/api";
import { clientFromPriceMinorOf, clientAmountMinor } from "@/lib/gridgoPrice";
import { lineTotalMinor, squareUnitWord, unitWord } from "@/lib/measurement";

/** Chosen option id per group id. One per group — every group is single-select. */
export type ListingSelection = Record<string, string>;

/**
 * URI `<Image>` should load for a listing sample.
 *
 * Prefer the signed `downloadUrl` from the payload. The relative `url`
 * (`/catalog/media/:fileId`) is metadata, not image bytes — feeding it to
 * SamplePhoto yields an empty crop-mark plate.
 */
export function samplePhotoUri(
  photo: CatalogPhoto | null | undefined,
): string | null {
  return photo?.downloadUrl ?? null;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

/** The steps a client must answer, in the shop's order. */
export function specGroups(item: CatalogItem): CatalogOptionGroup[] {
  return item.optionGroups
    .filter((group) => group.kind !== "addon")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** The extras a client may skip. */
export function addOnGroups(item: CatalogItem): CatalogOptionGroup[] {
  return item.optionGroups
    .filter((group) => group.kind === "addon")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function findOption(
  item: CatalogItem,
  optionId: string,
): { group: CatalogOptionGroup; option: CatalogOption } | null {
  for (const group of item.optionGroups) {
    const option = group.options.find((candidate) => candidate.id === optionId);
    if (option) return { group, option };
  }
  return null;
}

function selectedOption(group: CatalogOptionGroup, selection: ListingSelection): CatalogOption | undefined {
  return group.options.find((option) => option.id === selection[group.id]);
}

/** Selected option ids, in the shop's own group order. */
export function selectedOptionIds(
  item: CatalogItem,
  selection: ListingSelection,
): string[] {
  return [...specGroups(item), ...addOnGroups(item)]
    .map((group) => selectedOption(group, selection)?.id)
    .filter((id): id is string => Boolean(id));
}

/** Every required step answered. Until then there is no price to show. */
export function isSelectionComplete(
  item: CatalogItem,
  selection: ListingSelection,
): boolean {
  return firstMissingGroup(item, selection) === null;
}

/** The first step still unanswered, so the sheet can say which one. */
export function firstMissingGroup(
  item: CatalogItem,
  selection: ListingSelection,
): CatalogOptionGroup | null {
  return (
    [...specGroups(item), ...addOnGroups(item)]
      .find((group) => (group.required || Boolean(selection[group.id])) && !selectedOption(group, selection)) ?? null
  );
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * What one unit costs with these options.
 *
 * Base plus every selected modifier, floored at zero — the same formula the
 * API applies (`max(0, basePriceMinor + modifiers)`), so the running total on
 * the sheet and the server's `effectivePriceMinor` agree.
 */
export function unitPriceMinor(item: CatalogItem, selection: ListingSelection): number {
  const modifiers = selectedOptionIds(item, selection).reduce((sum, id) => {
    const found = findOption(item, id);
    return sum + (found?.option.priceModifierMinor ?? 0);
  }, 0);
  return Math.max(0, item.basePriceMinor + modifiers);
}

/**
 * The unit price the client is shown: the shop figure plus GRIDGO's fee.
 *
 * Shop arithmetic stays in `unitPriceMinor` so the sheet and the server's
 * `effectivePriceMinor` still agree. This wrapper is the only place the
 * a non-UI consumer marks that figure up. GridgoPrice takes the shop amount.
 */
export function clientUnitPriceMinor(
  item: CatalogItem,
  selection: ListingSelection,
  serviceFeeRateBps: number,
): number {
  return clientAmountMinor(unitPriceMinor(item, selection), serviceFeeRateBps);
}

/**
 * The listing-sheet running total the client is shown.
 *
 * Priced as the shop would, then marked up — the same order checkout uses
 * (fee on the line, not a second formula on the unit).
 */
export function clientLineTotalMinor(
  item: CatalogItem,
  quantity: number,
  measurement: LineMeasurement | null,
  shopUnitPriceMinor: number,
  serviceFeeRateBps: number,
): number | null {
  const shopTotal = lineTotalMinor(item, quantity, measurement, shopUnitPriceMinor);
  if (shopTotal == null) return null;
  return clientAmountMinor(shopTotal, serviceFeeRateBps);
}

/**
 * What the price on the sheet is the price of — the listing's own unit, in
 * the client's words. Mirrors the six `pricingUnit` values the API stores.
 */
export function unitLine(
  item: Pick<CatalogItem, "pricingUnit" | "packageQty" | "measureUnit">,
): string {
  switch (item.pricingUnit) {
    case "per_package":
      return item.packageQty ? `per pack of ${item.packageQty}` : "per pack";
    case "per_page":
      return "per page";
    case "per_area":
      return `per ${squareUnitWord(item.measureUnit) || "square"}`;
    case "per_length":
      return `per ${unitWord(item.measureUnit, false) || "length"}`;
    case "whole_job":
      return "for the job";
    default:
      return "each";
  }
}

/**
 * "From ₱440.00 per pack of 100" — the starting price on a category row, at
 * GRIDGO's price. Takes the rate rather than reading it, so it stays pure.
 */
export function startingPriceLine(
  item: Pick<CatalogItem, "fromPriceMinor" | "pricingUnit" | "packageQty" | "measureUnit">,
  serviceFeeRateBps: number,
): string {
  return `From ${formatPhp(clientAmountMinor(item.fromPriceMinor, serviceFeeRateBps))} ${unitLine(item)}`;
}

/**
 * The starting price the client is shown. Reads the API's GRIDGO field when
 * present, otherwise applies the same markup as `clientAmountMinor`.
 */
export function clientStartingPriceLine(
  item: Pick<
    CatalogItem,
    "fromPriceMinor" | "clientFromPriceMinor" | "pricingUnit" | "packageQty" | "measureUnit"
  >,
  serviceFeeRateBps?: number | null,
): string {
  const price = clientFromPriceMinorOf(item, serviceFeeRateBps);
  return price == null ? "Price loading" : `From ${formatPhp(price)} ${unitLine(item)}`;
}

/**
 * How many actual printed things a quantity comes to.
 * Null for per-unit pricing, where the quantity already is the count.
 */
export function pieceCount(item: CatalogItem, quantity: number): number | null {
  if (item.pricingUnit !== "per_package" || !item.packageQty) return null;
  return item.packageQty * Math.max(1, Math.floor(quantity));
}

/** "3 packs · 300 pieces" — the line under a quantity stepper. */
export function quantityLine(item: CatalogItem, quantity: number): string {
  const count = Math.max(1, Math.floor(quantity));
  if (item.pricingUnit !== "per_package") {
    return count === 1 ? "1 piece" : `${count} pieces`;
  }
  const pieces = pieceCount(item, count);
  const packs = count === 1 ? "1 pack" : `${count} packs`;
  return pieces ? `${packs} · ${pieces} pieces` : packs;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Press time only: working hours do not include the queue or closed hours. */
export function printTimeLine(hours: number | null | undefined): string | null {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) return null;
  return `Prints in about ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/** Just the duration — "2 days", "6 hours" — for a card's readout cell. */
export function readyInShort(hours: number | null | undefined): string | null {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) return null;
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

// ---------------------------------------------------------------------------
// Artwork formats
// ---------------------------------------------------------------------------

/** Formats this listing takes as an uploaded file. */
export function fileFormats(item: CatalogItem): AcceptedFormat[] {
  return item.acceptedFormats.filter(
    (format) => format.active !== false && format.inputKind === "file",
  );
}

/** Formats this listing takes as a link instead of a file. */
export function linkFormats(item: CatalogItem): AcceptedFormat[] {
  return item.acceptedFormats.filter(
    (format) => format.active !== false && format.inputKind === "url",
  );
}

/**
 * MIME types for the file picker.
 *
 * Only this listing's formats, so a client cannot pick a PDF for a shop that
 * prints from images only and find out after the upload. A format with no MIME
 * type of its own (3MF, STL) contributes nothing here and is offered as a link
 * instead, which is what the platform registry says about it.
 */
export function pickerMimeTypes(item: CatalogItem): string[] {
  const types = new Set<string>();
  for (const format of fileFormats(item)) {
    for (const mime of format.mimeTypes) types.add(mime);
  }
  return [...types];
}

/** Lowercase extensions this listing accepts, for checking a picked file. */
export function acceptedExtensions(item: CatalogItem): string[] {
  return fileFormats(item).flatMap((format) =>
    format.extensions.map((extension) => extension.toLowerCase()),
  );
}

/** "JPEG, PDF or PNG" — the sheet's own words for what to send. */
export function formatSentence(formats: AcceptedFormat[]): string {
  const names = formats.map((format) => format.displayName);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

/**
 * Does the file the client picked match what this listing takes?
 *
 * Extension first, because it is what the client can see and fix. The picker's
 * MIME type is the fallback: iOS reports unreliable types, so a name that
 * matches is trusted over a type that does not.
 */
export function fileMatchesFormats(
  item: CatalogItem,
  fileName: string,
  mimeType?: string | null,
): boolean {
  const accepted = acceptedExtensions(item);
  if (accepted.length === 0) return false;
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (extension && accepted.includes(extension)) return true;
  const mime = mimeType?.toLowerCase() ?? "";
  return mime ? pickerMimeTypes(item).some((type) => type.toLowerCase() === mime) : false;
}

// ---------------------------------------------------------------------------
// Spec bindings
// ---------------------------------------------------------------------------

/**
 * What the client chose for one governed field.
 *
 * A shop labels its own options ("A4", "Matte 150gsm") and binds them to the
 * platform's fields. The order carries the bound value, so Operations and the
 * supplier read the same words the client picked.
 */
export function boundValue(
  item: CatalogItem,
  selection: ListingSelection,
  fieldCode: string,
): string {
  for (const id of selectedOptionIds(item, selection)) {
    const found = findOption(item, id);
    const binding = found?.option.specBinding;
    if (binding?.fieldCode !== fieldCode) continue;
    return binding.value ?? binding.valueCode ?? found?.option.label ?? "";
  }
  return "";
}

/** Every answered step as label pairs, for a summary row or an order note. */
export function selectionSummary(
  item: CatalogItem,
  selection: ListingSelection,
): { groupId: string; groupName: string; label: string; priceModifierMinor: number }[] {
  return [...specGroups(item), ...addOnGroups(item)]
    .map((group) => {
      const option = selectedOption(group, selection);
      if (!option) return null;
      return {
        groupId: group.id,
        groupName: group.name,
        label: option.label,
        priceModifierMinor: option.priceModifierMinor,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

// ---------------------------------------------------------------------------
// Artwork against the chosen size
// ---------------------------------------------------------------------------

/**
 * Trim sizes GRIDGO knows the proportions of.
 *
 * Only used to warn, never to block: a client who means to print an A5 design
 * on A4 with a border is doing something deliberate, and a shop can trim. The
 * warning exists because the far more common case is someone sending a phone
 * screenshot for a flyer and finding out at delivery.
 */
const TRIM_RATIOS: Record<string, number> = {
  a3: 297 / 420,
  a4: 210 / 297,
  a5: 148 / 210,
  a6: 105 / 148,
  letter: 8.5 / 11,
  legal: 8.5 / 14,
  "2x3": 2 / 3,
  "3x2": 3 / 2,
  "2x6": 2 / 6,
  "4x6": 4 / 6,
};

/** The proportion of a size label, or null when GRIDGO cannot tell. */
export function trimRatio(size: string): number | null {
  const key = size.trim().toLowerCase().replace(/\s+/g, "");
  if (TRIM_RATIOS[key] != null) return TRIM_RATIOS[key];
  // "3ft x 5ft", "24 x 36 in" — same units both sides, so the units cancel.
  const pair = key.match(/^(\d+(?:\.\d+)?)(?:[a-z]*)[x×](\d+(?:\.\d+)?)/);
  if (!pair) return null;
  const width = Number(pair[1]);
  const height = Number(pair[2]);
  if (!width || !height) return null;
  return width / height;
}

export type ArtworkFitWarning = {
  /** What is off, in the client's terms. */
  message: string;
  /** Always false. A mismatch is a warning; the client may send it anyway. */
  blocking: false;
};

/**
 * Compare artwork proportions against the size the client picked.
 *
 * A tolerance of 5% covers bleed and rounding — a 3mm bleed on A5 is about 2%.
 * Beyond that the difference is visible on the printed sheet, so it is said
 * once, plainly, next to the mockup, and the client decides.
 */
export function artworkFitWarning(
  size: string,
  artwork: { width: number; height: number } | null,
  sizeMilli?: { width: number; height: number } | null,
): ArtworkFitWarning | null {
  if (!artwork || !artwork.width || !artwork.height) return null;
  const target =
    trimRatio(size) ??
    (sizeMilli && sizeMilli.width && sizeMilli.height
      ? sizeMilli.width / sizeMilli.height
      : null);
  if (target == null) return null;

  const actual = artwork.width / artwork.height;
  const upright = Math.min(actual, 1 / actual);
  const targetUpright = Math.min(target, 1 / target);
  const drift = Math.abs(upright - targetUpright) / targetUpright;
  if (drift <= 0.05) return null;

  const orientation =
    actual > 1 === target > 1
      ? ""
      : actual > 1
        ? " Your file is landscape and the size is portrait."
        : " Your file is portrait and the size is landscape.";

  return {
    message:
      `Your artwork is ${ratioWords(actual)} and ${size} is ${ratioWords(target)}, so it will be ` +
      `cropped or leave a white edge.${orientation} You can send it as it is — the shop will tell ` +
      `you if it needs a new file.`,
    blocking: false,
  };
}

/** "3:2", "16:9" — a proportion in the words people use for one. */
function ratioWords(ratio: number): string {
  const known: [number, string][] = [
    [1, "square"],
    [4 / 3, "4:3"],
    [3 / 4, "3:4"],
    [3 / 2, "3:2"],
    [2 / 3, "2:3"],
    [16 / 9, "16:9"],
    [9 / 16, "9:16"],
    [Math.SQRT2, "A-series"],
    [1 / Math.SQRT2, "A-series"],
  ];
  let closest = known[0];
  for (const candidate of known) {
    if (Math.abs(candidate[0] - ratio) < Math.abs(closest[0] - ratio)) closest = candidate;
  }
  return Math.abs(closest[0] - ratio) / ratio < 0.06 ? closest[1] : `${ratio.toFixed(2)}:1`;
}
