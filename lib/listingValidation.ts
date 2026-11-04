/**
 * What is still missing or invalid on the print-details sheet.
 *
 * The sheet used to say "Pick a size first" under the commit bar. That names
 * the step but leaves the client at the bottom of a long form. This module
 * lists every unanswered required choice and every broken number, in the order
 * they appear on the sheet, so the screen can mark each one and scroll to the
 * first.
 *
 * It does not invent requirements: a group is asked when the listing already
 * requires it (or when a selected option has disappeared), a layout only when
 * the shop offers one, a measurement only when the listing is priced by size.
 */

import type { CatalogItem, PrintLayoutCode } from "@/lib/api";
import { addOnGroups, specGroups, type ListingSelection } from "@/lib/listing";
import {
  belowMinimumOrder,
  EMPTY_MEASUREMENT,
  measurementKind,
  toMilli,
  type MeasurementDraft,
} from "@/lib/measurement";
import { specialInstructionsProblem } from "@/lib/orderChanges";

const SIZE_FIELDS = new Set(["size", "item_size", "dimensions"]);

/** Space kept above the field when the sheet jumps to it. */
export const LISTING_FIELD_SCROLL_GAP = 12;

export type ListingProblemKey =
  | `group:${string}`
  | "layout"
  | "measure:width"
  | "measure:height"
  | "measure:length"
  | "quantity"
  | "note";

export type ListingProblem = {
  key: ListingProblemKey;
  message: string;
};

export type ListingSheetInput = {
  item: CatalogItem;
  selection: ListingSelection;
  layout: PrintLayoutCode | null;
  measured: MeasurementDraft;
  quantity: number;
  note: string;
  offeredLayouts: readonly string[];
  tooWide: { short: string } | null;
};

function selectedInGroup(
  group: CatalogItem["optionGroups"][number],
  selection: ListingSelection,
): boolean {
  return group.options.some((option) => option.id === selection[group.id]);
}

/**
 * Ask for a missing group without forcing "a/an" onto the catalogue label.
 * Dev listings include plurals (Sides, Eyelets), vowel names (Item) and
 * multi-word labels (Paper size, What you need); "Pick a sides first" fails
 * all of those. The heading already carries the name, so this keeps it as written.
 */
export function groupChoiceMessage(name: string): string {
  const label = name.trim();
  return label ? `Choose an option for ${label}.` : "Choose an option.";
}

function groupProblem(
  group: CatalogItem["optionGroups"][number],
  selection: ListingSelection,
): ListingProblem | null {
  if (!(group.required || Boolean(selection[group.id])) || selectedInGroup(group, selection)) {
    return null;
  }
  return {
    key: `group:${group.id}`,
    message: groupChoiceMessage(group.name),
  };
}

function measureMessage(kind: "width" | "height" | "length", typed: string): string {
  if (typed.trim()) {
    if (kind === "width") return "Enter a width greater than zero.";
    if (kind === "height") return "Enter a height greater than zero.";
    return "Enter a length greater than zero.";
  }
  if (kind === "width") return "Enter how wide it is.";
  if (kind === "height") return "Enter how tall it is.";
  return "Enter how long it is.";
}

/** The spec group that carries the job's width, when size is a picked option. */
function selectedSizeGroupId(
  item: CatalogItem,
  selection: ListingSelection,
): string | null {
  for (const group of specGroups(item)) {
    const option = group.options.find((entry) => entry.id === selection[group.id]);
    if (!option) continue;
    if (option.specBinding && SIZE_FIELDS.has(option.specBinding.fieldCode)) return group.id;
  }
  return specGroups(item).find((group) => /size/i.test(group.name))?.id ?? null;
}

/**
 * Problems on the sheet, in the order the fields are drawn: specs, layout,
 * the optional note, add-ons, size numbers, then quantity.
 */
export function listingProblems(input: ListingSheetInput): ListingProblem[] {
  const problems: ListingProblem[] = [];
  const measured = input.measured ?? EMPTY_MEASUREMENT;

  for (const group of specGroups(input.item)) {
    const problem = groupProblem(group, input.selection);
    if (problem) problems.push(problem);
  }

  if (
    input.offeredLayouts.length > 0 &&
    !input.offeredLayouts.some((code) => code === input.layout)
  ) {
    problems.push({ key: "layout", message: "Pick a layout first." });
  }

  const noteProblem = specialInstructionsProblem(input.note);
  if (noteProblem) problems.push({ key: "note", message: noteProblem });

  for (const group of addOnGroups(input.item)) {
    const problem = groupProblem(group, input.selection);
    if (problem) problems.push(problem);
  }

  const kind = measurementKind(input.item);
  if (kind === "length") {
    if (toMilli(measured.length) == null) {
      problems.push({
        key: "measure:length",
        message: measureMessage("length", measured.length),
      });
    }
  } else if (kind === "area") {
    if (toMilli(measured.width) == null) {
      problems.push({
        key: "measure:width",
        message: measureMessage("width", measured.width),
      });
    }
    if (toMilli(measured.height) == null) {
      problems.push({
        key: "measure:height",
        message: measureMessage("height", measured.height),
      });
    }
  }

  if (input.tooWide) {
    const widthKey: ListingProblemKey =
      kind === "length" ? "measure:length" : kind === "area" ? "measure:width" : `group:${selectedSizeGroupId(input.item, input.selection) ?? ""}`;
    if (widthKey !== "group:" && !problems.some((problem) => problem.key === widthKey)) {
      problems.push({ key: widthKey, message: input.tooWide.short });
    }
  }

  const minimum = belowMinimumOrder(input.item, input.quantity);
  if (minimum != null) {
    problems.push({
      key: "quantity",
      message: `This shop takes orders of ${minimum} and up. Change the quantity first.`,
    });
  }

  return problems;
}

export function firstListingProblem(input: ListingSheetInput): ListingProblem | null {
  return listingProblems(input)[0] ?? null;
}

export function listingProblemMessage(
  problems: readonly ListingProblem[],
  key: ListingProblemKey,
): string | null {
  return problems.find((problem) => problem.key === key)?.message ?? null;
}

/** Scroll offset that leaves a little of the field's heading in view. */
export function listingProblemScrollY(fieldY: number): number {
  return Math.max(0, fieldY - LISTING_FIELD_SCROLL_GAP);
}

export function isMeasureProblemKey(
  key: ListingProblemKey,
): key is "measure:width" | "measure:height" | "measure:length" {
  return key.startsWith("measure:");
}
