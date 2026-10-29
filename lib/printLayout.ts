import { boundValue, type ListingSelection } from "@/lib/listing";
import type {
  CatalogItem,
  CartLineRecord,
  PrintLayoutCheck,
  PrintLayoutCode,
  PrintLayoutPaper,
} from "@/lib/api";

/**
 * How a document or drawing sits on the paper (gridgo-api
 * `docs/PRINT_LAYOUT_API.md`, gridgo-client#245).
 *
 * A shop marks which layouts a product prints; a client ordering it picks
 * one, and nothing is preselected. GRIDGO measures the file's page against
 * the paper and says what to warn about. This module turns that check into
 * words and into the shapes the preview draws. It never measures anything
 * itself: a page size GRIDGO could not read is said to be unknown, never
 * guessed.
 */

export const LAYOUT_CODES = [
  "fit_to_paper",
  "actual_size_centered",
  "actual_size_original_position",
] as const;

export type KnownLayout = (typeof LAYOUT_CODES)[number];

const LABELS: Record<KnownLayout, string> = {
  fit_to_paper: "Fit to paper",
  actual_size_centered: "Actual size, centred",
  actual_size_original_position: "Actual size, in its original position",
};

const HINTS: Record<KnownLayout, string> = {
  fit_to_paper: "Scaled up or down to fill the paper.",
  actual_size_centered: "Printed at 100%, in the middle of the paper.",
  actual_size_original_position: "Printed at 100%, from the page's top-left corner.",
};

/** The scale note under Fit to paper. Never a block. */
export const SCALE_NOTE = "The drawing scale will change to fit the paper.";

/** Under the choice before the item has a file: the check needs one. */
export const LAYOUT_NEEDS_FILE = "Upload your file on the next step to see how it sits on the paper.";

export function isKnownLayout(code: unknown): code is KnownLayout {
  return typeof code === "string" && (LAYOUT_CODES as readonly string[]).includes(code);
}

/** "Fit to paper". A code added after this build shipped reads as itself, tidied. */
export function layoutLabel(code: PrintLayoutCode): string {
  if (isKnownLayout(code)) return LABELS[code];
  const words = code.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function layoutHint(code: KnownLayout): string {
  return HINTS[code];
}

/**
 * The layouts this listing offers, in the canonical order. Empty for a product
 * with no layout choice, and for an API from before layouts — then nothing is
 * shown and nothing is asked.
 */
export function offeredLayouts(listing: Pick<CatalogItem, "printLayouts"> | null | undefined): KnownLayout[] {
  const listed = listing?.printLayouts ?? [];
  return LAYOUT_CODES.filter((code) => listed.includes(code));
}

/** A line whose product offers layouts and has none chosen, or one no longer offered. */
export function lineNeedsLayout(line: Pick<CartLineRecord, "printLayout" | "listing">): boolean {
  const offered = offeredLayouts(line.listing);
  if (!offered.length) return false;
  return !line.printLayout || !offered.includes(line.printLayout as KnownLayout);
}

// ---------------------------------------------------------------------------
// What to say
// ---------------------------------------------------------------------------

export type CutOffAdvice = {
  title: string;
  body: string;
  /** The offered paper that takes the whole page, when this listing has it. */
  switchTo: PrintLayoutPaper | null;
};

export type LayoutAdvice = {
  /** Under Fit to paper. */
  scale: string | null;
  /** An actual-size layout on a page bigger than the paper. */
  cutOff: CutOffAdvice | null;
  /** An actual-size layout that fits: a quiet confirmation. */
  fits: string | null;
  /** What GRIDGO could not read, in words. */
  unknown: string[];
  /** Pages of different sizes. */
  mixed: string | null;
};

const EMPTY_ADVICE: LayoutAdvice = { scale: null, cutOff: null, fits: null, unknown: [], mixed: null };

/** Whether this listing still offers an option by id. */
function listingHasOption(listing: Pick<CatalogItem, "optionGroups"> | null | undefined, optionId: string): boolean {
  return Boolean(listing?.optionGroups?.some((group) => group.options.some((option) => option.id === optionId)));
}

/**
 * GRIDGO's check, said. `layout` is the one on screen — on the listing it can
 * run ahead of the saved check — and wins over `check.layout`.
 */
export function layoutAdvice(
  check: PrintLayoutCheck | null | undefined,
  options: {
    layout?: PrintLayoutCode | null;
    listing?: Pick<CatalogItem, "optionGroups" | "printLayouts"> | null;
    /** Say "upload your file" when the check has none. Off where a file is already the question. */
    askForFile?: boolean;
    /** A paper is picked. Until it is, an unread paper size is not news. Defaults to true. */
    paperPicked?: boolean;
  } = {},
): LayoutAdvice {
  const layout = options.layout !== undefined ? options.layout : check?.layout ?? null;
  if (!check) {
    return layout === "fit_to_paper" ? { ...EMPTY_ADVICE, scale: SCALE_NOTE } : EMPTY_ADVICE;
  }
  const unknown: string[] = [];
  for (const entry of check.unknown ?? []) {
    if (entry.code === "no_artwork_file") {
      if (options.askForFile) unknown.push(LAYOUT_NEEDS_FILE);
    } else if (entry.code === "paper_size_unknown") {
      // Only once a paper is picked: before that there is nothing to read.
      if (options.paperPicked !== false) {
        unknown.push("GRIDGO could not read a paper size from this product's options, so it cannot check the fit.");
      }
    } else if (entry.code === "page_size_unknown") {
      const many = check.files.length > 1;
      unknown.push(
        many
          ? "GRIDGO could not read the page size of one of your files, so it cannot tell whether anything on it will be cut off."
          : "GRIDGO could not read the page size of your file, so it cannot tell whether anything will be cut off.",
      );
    }
  }
  const mixed = check.files.some((file) => file.page?.mixedPageSizes)
    ? "Your file has pages of different sizes. GRIDGO checks the largest one; the preview shows page 1."
    : null;

  let scale: string | null = null;
  let cutOff: CutOffAdvice | null = null;
  let fits: string | null = null;
  const paper = check.paper;
  if (layout === "fit_to_paper") {
    // Said always, as the contract asks — unless GRIDGO measured the page
    // and it already is the paper's size, when the scale really stays.
    // `scaleChanges` is about Fit to paper only when the check was made for it.
    const sameSize = check.layout === "fit_to_paper" && check.scaleChanges === false;
    scale = sameSize && paper ? `Your page is already ${paper.label}, so the drawing scale stays as drawn.` : SCALE_NOTE;
  } else if (layout && paper) {
    // The layout on screen may run ahead of the check; the page sizes do not
    // depend on it, so the cut-off follows from `exceedsPaper`.
    if (check.exceedsPaper === true) {
      const suggested = check.suggestedPaper;
      const switchTo = suggested && listingHasOption(options.listing, suggested.optionId) ? suggested : null;
      const offersFit = offeredLayouts(options.listing ?? { printLayouts: check.supportedLayouts }).includes("fit_to_paper");
      cutOff = {
        title: `Parts of your page will be cut off on ${paper.label}.`,
        body: suggested
          ? `Choose ${suggested.label} to print it whole.`
          : offersFit
            ? "No paper this product offers is big enough. Choose Fit to paper to print it whole, scaled down."
            : "No paper this product offers is big enough for your page.",
        switchTo,
      };
    } else if (check.exceedsPaper === false && check.files.length > 0) {
      fits = `Your page fits on ${paper.label} and prints at its real size.`;
    }
  }
  return { scale, cutOff, fits, unknown, mixed };
}

const PAPER_FIELDS = ["size", "paper_size", "item_size", "dimensions"];

/**
 * The choice group GRIDGO reads the paper from: the one bound to a size field,
 * as the fit check reads it. Null when the listing has none.
 */
export function paperGroupId(listing: Pick<CatalogItem, "optionGroups"> | null | undefined): string | null {
  const group = listing?.optionGroups?.find((entry) =>
    entry.options.some((option) => PAPER_FIELDS.includes(String(option.specBinding?.fieldCode ?? ""))),
  );
  return group?.id ?? null;
}

/**
 * The option ids with the paper swapped for `optionId`, in its own choice
 * group. Null when the listing does not offer it.
 */
export function withPaper(
  listing: Pick<CatalogItem, "optionGroups">,
  optionIds: string[],
  optionId: string,
): string[] | null {
  const group = listing.optionGroups.find((entry) => entry.options.some((option) => option.id === optionId));
  if (!group) return null;
  const others = new Set(group.options.map((option) => option.id));
  return [...optionIds.filter((id) => !others.has(id)), optionId];
}

/**
 * The whole line change for a paper swap: the option ids, and the size,
 * material and finish GRIDGO keeps beside them re-read from the new options —
 * the same reading the listing screen sends — so the shop never sees "A1" on
 * a line that prints on A0.
 */
export function paperChange(
  listing: CatalogItem,
  line: Pick<CartLineRecord, "optionIds" | "structuredSpec">,
  optionId: string,
): { optionIds: string[]; structuredSpec: Record<string, unknown> } | null {
  const optionIds = withPaper(listing, line.optionIds, optionId);
  if (!optionIds) return null;
  const selection: ListingSelection = {};
  for (const group of listing.optionGroups) {
    const chosen = group.options.find((option) => optionIds.includes(option.id));
    if (chosen) selection[group.id] = chosen.id;
  }
  return {
    optionIds,
    structuredSpec: {
      ...line.structuredSpec,
      size: boundValue(listing, selection, "size"),
      material: boundValue(listing, selection, "material"),
      finish: boundValue(listing, selection, "finish"),
    },
  };
}

// ---------------------------------------------------------------------------
// The preview's shapes
// ---------------------------------------------------------------------------

export type Box = { x: number; y: number; width: number; height: number };

export type LayoutPreview = {
  /** The paper, at the origin, turned to match the page. Thousandths of a millimetre. */
  paper: Box;
  /** Where the file's page lands on that paper; it may run past the edges. */
  page: Box;
  /** The page scaled by this much (1 for an actual-size layout). */
  scale: number;
  /** Some of the page falls outside the paper. */
  clipped: boolean;
  /** The smallest box holding paper and page: what the drawing frames. */
  bounds: Box;
};

/** GRIDGO's tolerance: a page within 1 mm of the paper fits. */
const FIT_TOLERANCE_MILLI = 1000;

/**
 * The page on the paper, as the layout places it (`docs/PRINT_LAYOUT_API.md#preview`).
 *
 * The paper is turned to match the page's orientation first, as the check
 * allows either way round. Fit to paper scales the page into the paper,
 * keeping its proportions, centred. Actual size centred keeps the page at its
 * real size in the middle; in its original position it starts from the paper's
 * top-left corner. Anything outside the paper is what gets cut off.
 */
export function layoutPreview(
  paperSize: { widthMilli: number; heightMilli: number },
  pageSize: { widthMilli: number; heightMilli: number },
  layout: PrintLayoutCode,
): LayoutPreview | null {
  const pageWidth = pageSize.widthMilli;
  const pageHeight = pageSize.heightMilli;
  if (!(pageWidth > 0 && pageHeight > 0 && paperSize.widthMilli > 0 && paperSize.heightMilli > 0)) return null;
  const short = Math.min(paperSize.widthMilli, paperSize.heightMilli);
  const long = Math.max(paperSize.widthMilli, paperSize.heightMilli);
  const landscape = pageWidth > pageHeight;
  const paper: Box = landscape
    ? { x: 0, y: 0, width: long, height: short }
    : pageWidth < pageHeight
      ? { x: 0, y: 0, width: short, height: long }
      : { x: 0, y: 0, width: paperSize.widthMilli, height: paperSize.heightMilli };

  let page: Box;
  let scale = 1;
  if (layout === "fit_to_paper") {
    scale = Math.min(paper.width / pageWidth, paper.height / pageHeight);
    const width = pageWidth * scale;
    const height = pageHeight * scale;
    page = { x: (paper.width - width) / 2, y: (paper.height - height) / 2, width, height };
  } else if (layout === "actual_size_original_position") {
    page = { x: 0, y: 0, width: pageWidth, height: pageHeight };
  } else {
    // Centred, and any code this build does not know: the honest middle
    // ground is the page at its real size, where it would sit.
    page = { x: (paper.width - pageWidth) / 2, y: (paper.height - pageHeight) / 2, width: pageWidth, height: pageHeight };
  }

  const clipped =
    page.x < -FIT_TOLERANCE_MILLI ||
    page.y < -FIT_TOLERANCE_MILLI ||
    page.x + page.width > paper.width + FIT_TOLERANCE_MILLI ||
    page.y + page.height > paper.height + FIT_TOLERANCE_MILLI;
  const minX = Math.min(0, page.x);
  const minY = Math.min(0, page.y);
  const maxX = Math.max(paper.width, page.x + page.width);
  const maxY = Math.max(paper.height, page.y + page.height);
  return { paper, page, scale, clipped, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}

/** "594 × 841 mm", to the millimetre. */
export function sizeLine(size: { widthMilli: number; heightMilli: number }): string {
  const mm = (milli: number) => String(Math.round(milli / 1000));
  return `${mm(size.widthMilli)} × ${mm(size.heightMilli)} mm`;
}

/** The first file's page the check could read, for the preview. */
export function previewPageOf(check: PrintLayoutCheck | null | undefined) {
  return check?.files.find((file) => file.page)?.page ?? null;
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/** The shop stopped printing the layout this line chose. */
export function withdrawnLayoutLine(code: PrintLayoutCode): string {
  return `This shop no longer prints ${layoutLabel(code)}. Open Artwork to choose another layout.`;
}

/** One line under a basket row: the layout chosen, a cut-off, or that one is owed. */
export function lineLayoutSummary(
  line: Pick<CartLineRecord, "printLayout" | "printLayoutCheck" | "listing">,
): { text: string; tone: "muted" | "warning" } | null {
  if (!offeredLayouts(line.listing).length) return null;
  if (!line.printLayout) return { text: "No layout chosen yet. Open Artwork to choose one.", tone: "warning" };
  if (lineNeedsLayout(line)) return { text: withdrawnLayoutLine(line.printLayout), tone: "warning" };
  const label = layoutLabel(line.printLayout);
  const check = line.printLayoutCheck;
  if (check?.cutOff && check.paper) {
    return { text: `Layout: ${label}. Parts are cut off on ${check.paper.label}.`, tone: "warning" };
  }
  return { text: `Layout: ${label}`, tone: "muted" };
}

export type PrintLayoutRefusal = {
  code: "print_layout_required" | "print_layout_not_supported";
  lineId: string | null;
};

/** Checkout's refusal of a line with no layout, or one the shop no longer prints. */
export function printLayoutRefusalOf(body: unknown): PrintLayoutRefusal | null {
  if (typeof body !== "object" || !body) return null;
  const { error, lineId } = body as { error?: unknown; lineId?: unknown };
  if (error !== "print_layout_required" && error !== "print_layout_not_supported") return null;
  return { code: error, lineId: typeof lineId === "string" ? lineId : null };
}
