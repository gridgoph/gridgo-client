/**
 * Document and construction printing priced by colour (gridgo-api
 * `docs/COLOUR_PRICING_API.md`, report 0BE07331).
 *
 * A plan shop charges each sheet by how much strong colour is on it: black,
 * white, greys and pale colours are cheap, saturated orange or red is not.
 * GRIDGO measures every page as it will print on the paper and layout chosen,
 * and a listing the shop marked "priced by colour" is then priced page by
 * page from the shop's own tier rates.
 *
 * This module decides only what the client reads. GRIDGO owns every number:
 * the coverage, the tier, the all-in sheet price and the line total arrive
 * from the API and are drawn as sent — never summed, rounded or filled in
 * here. Three rules are easy to break:
 *
 * - **A page without a shop rate has no price.** It reads "This page needs a
 *   price check", the total stays empty and checkout is refused until the
 *   shop prices it. GRIDGO never fills one in, and neither does this app.
 * - **Some strong colour is never "0%".** Only a page with none reads 0%; any
 *   coverage at all reads at least 0.1%, because it already costs a tier more.
 * - **The one-colour warning never blocks.** It is advice about the file.
 */

import type {
  CartLineRecord,
  CatalogItem,
  ColourPage,
  ColourPricing,
  ColourTier,
  ColourTierSet,
  QuantityMode,
} from "@/lib/api";
import { formatPhp } from "@/lib/api";

/** The report's own words for a page with no shop rate. */
export const PRICE_CHECK_LINE = "This page needs a price check";

/** Said once beside the per-page list. */
export const ESTIMATE_NOTE =
  "GRIDGO measures colour from your file, so this is an estimate. If the shop finds a page in a different colour level, it asks you to approve the new price before printing. It never prints at a different price.";

/** Whether this listing measures colour at all, and why. */
export function listingColourKind(
  listing: Pick<CatalogItem, "pricedByColour" | "oneColour"> | null | undefined,
): "priced" | "one_colour" | null {
  if (listing?.pricedByColour) return "priced";
  if (listing?.oneColour) return "one_colour";
  return null;
}

/** A line whose product is priced by colour or prints in one colour. */
export function lineMeasuresColour(line: Pick<CartLineRecord, "listing" | "colourPricing">): boolean {
  return listingColourKind(line.listing) != null || Boolean(line.colourPricing);
}

/** A line priced page by page from its colour. */
export function linePricedByColour(line: Pick<CartLineRecord, "listing" | "colourPricing">): boolean {
  return line.colourPricing?.pricedByColour ?? line.listing?.pricedByColour === true;
}

// ---------------------------------------------------------------------------
// Coverage and tiers
// ---------------------------------------------------------------------------

/**
 * "18%", "0.4%", "0%". Rounded up to a tenth so a page with any strong colour
 * never reads as having none — that page is already a tier dearer.
 */
export function coverageText(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "0%";
  const tenths = Math.ceil(bps / 10);
  const value = tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
  return `${value}%`;
}

/** The tier in words. A3's monochrome limit is GRIDGO's setting, default 10%. */
export function tierLabel(tier: ColourTier | null | undefined, a3MonochromeMaxBps?: number | null): string | null {
  const a3Limit = coverageText(a3MonochromeMaxBps ?? 1000);
  switch (tier) {
    case "none":
      return "No strong colour";
    case "up_to_25":
      return "Up to 25% colour";
    case "up_to_50":
      return "Up to 50% colour";
    case "above_50":
      return "Over 50% colour";
    case "monochrome":
      return `Monochrome, up to ${a3Limit}`;
    case "full_colour":
      return `Full colour, over ${a3Limit}`;
    case null:
    case undefined:
      return null;
    default:
      return String(tier).replace(/_/g, " ");
  }
}

/** The A3 monochrome limit this measure was made with, else today's setting. */
export function a3LimitOf(pricing: Pick<ColourPricing, "request"> | null | undefined, current?: number | null): number | null {
  return pricing?.request?.thresholds?.a3MonochromeMaxBps ?? current ?? null;
}

export function quantityModeLabel(mode: QuantityMode | null | undefined): string | null {
  return QUANTITY_MODE_LABELS[mode ?? ""] ?? null;
}

const QUANTITY_MODE_LABELS: Record<string, string> = {
  copies_each_page: "Copies of each page",
  document_sets: "Sets of the whole document",
};

/** Where the tier lines fall on a 0–100% scale, for the coverage meter. */
export function tierMarks(tierSet: ColourTierSet | null | undefined, a3MonochromeMaxBps?: number | null): number[] {
  if (tierSet === "a3") return [(a3MonochromeMaxBps ?? 1000) / 100];
  if (tierSet === "large_format") return [25, 50];
  return [];
}

/** "Page 3", or "File 2, page 1" when the line has more than one file. */
export function pageName(page: Pick<ColourPage, "fileId" | "page">, fileOrder: string[]): string {
  const index = fileOrder.indexOf(page.fileId);
  return fileOrder.length > 1 && index >= 0 ? `File ${index + 1}, page ${page.page}` : `Page ${page.page}`;
}

/** The files in the order GRIDGO concatenated them. */
export function pageFileOrder(pages: Pick<ColourPage, "fileId">[]): string[] {
  const order: string[] = [];
  for (const page of pages) if (!order.includes(page.fileId)) order.push(page.fileId);
  return order;
}

/** The all-in sheet price, or null. `sheetPriceMinor` is already the client's figure. */
export function pageSheetPrice(page: Pick<ColourPage, "sheetPriceMinor" | "clientSheetPriceMinor">): number | null {
  const value = page.clientSheetPriceMinor ?? page.sheetPriceMinor;
  return Number.isSafeInteger(value) ? (value as number) : null;
}

/** A page's tier exists but the shop set no rate for it. */
export function pageNeedsPriceCheck(page: Pick<ColourPage, "status" | "sheetPriceMinor">): boolean {
  return page.status === "needs_price_check";
}

/**
 * "Page 3: 18% strong colour, ₱60.00" — the report's own line. A page with
 * no rate says so instead of a price; one still waiting on the rest of the
 * order to be priced says only its colour.
 */
export function pageLine(page: ColourPage, fileOrder: string[], options: { showPrice: boolean }): string {
  const head = `${pageName(page, fileOrder)}: ${coverageText(page.strongColourBps)} strong colour`;
  if (!options.showPrice) return head;
  if (pageNeedsPriceCheck(page)) return `${head}. ${PRICE_CHECK_LINE}`;
  const price = pageSheetPrice(page);
  return price == null ? head : `${head}, ${formatPhp(price)}`;
}

// ---------------------------------------------------------------------------
// Copies or sets
// ---------------------------------------------------------------------------

export const QUANTITY_MODES: { value: QuantityMode; label: string; hint: string }[] = [
  {
    value: "copies_each_page",
    label: "Copies of each page",
    hint: "Each page printed several times and kept together: 1, 1, 1, 2, 2, 2.",
  },
  {
    value: "document_sets",
    label: "Sets of the whole document",
    hint: "The whole document printed in order, then again: 1, 2, 3, 1, 2, 3.",
  },
];

/** "sets" or "copies", by the count. */
export function quantityUnit(mode: QuantityMode | null | undefined, count: number): string {
  if (mode === "document_sets") return count === 1 ? "set" : "sets";
  return count === 1 ? "copy" : "copies";
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * "3 sets × 12 pages = 36 sheets". The sheet count is GRIDGO's when it sent
 * one, so the quantity is never multiplied in twice.
 */
export function sheetsLine(
  mode: QuantityMode | null | undefined,
  quantity: number,
  pages: number | null | undefined,
  totalSheets?: number | null,
): string | null {
  if (!mode || !pages || pages < 1 || quantity < 1) return null;
  const sheets = totalSheets ?? pages * quantity;
  return `${quantity} ${quantityUnit(mode, quantity)} × ${plural(pages, "page", "pages")} = ${plural(sheets, "sheet", "sheets")}`;
}

/** How many pages GRIDGO prints per copy or set of this line. */
export function linePageCount(line: Pick<CartLineRecord, "colourPricing" | "documentPages">): number | null {
  const measured = line.colourPricing?.pages.length;
  if (measured) return measured;
  return line.documentPages?.printed ?? null;
}

// ---------------------------------------------------------------------------
// Where the line stands
// ---------------------------------------------------------------------------

export type ColourStatusView = {
  tone: "muted" | "info" | "warning" | "error";
  title: string;
  body: string;
  /** What the screen offers to fix it. */
  action: "retry" | "choose_mode" | null;
};

/**
 * What the colour check says, or null when there is nothing to say (priced,
 * or a one-colour service that is only advised). Unknown statuses are "not
 * ready yet", never "priced".
 */
export function colourStatusView(pricing: ColourPricing | null | undefined): ColourStatusView | null {
  if (!pricing) return null;
  switch (pricing.status) {
    case "priced":
    case "fixed_price":
      return null;
    case "pending":
      return {
        tone: "info",
        title: "Measuring the colour on each page",
        body: "This usually takes under a minute. Each page's price appears here when it is done.",
        action: null,
      };
    case "configuration_required":
      return {
        tone: "muted",
        title: "Choose the paper and layout",
        body: "GRIDGO measures each page as it will print, so it needs the paper size and how the file sits on it.",
        action: null,
      };
    case "artwork_upload_required":
      return {
        tone: "warning",
        title: "Upload your file to price it",
        body: "GRIDGO measures colour from an uploaded PDF, PNG, JPEG or WebP file. A design link cannot be measured, so upload the file instead.",
        action: null,
      };
    case "quantity_mode_required":
      return {
        tone: "warning",
        title: "Choose copies or sets",
        body: "Say whether you want copies of each page or sets of the whole document to see your price.",
        action: "choose_mode",
      };
    case "needs_price_check":
      return {
        tone: "warning",
        title: "Some pages need a price check",
        body: "The shop has no price yet for that much colour on this paper. GRIDGO has asked Operations to check it with the shop. You can place the order once the shop prices it — GRIDGO never sets a price itself.",
        action: null,
      };
    case "failed":
      return {
        tone: "error",
        title: "GRIDGO could not measure this file",
        body: "Try again in a moment. If it fails again, export the file again and upload it.",
        action: "retry",
      };
    case "analysis_limit":
      return {
        tone: "error",
        title: "Upload this file again",
        body: "This file has been measured as many times as GRIDGO allows. Upload it again as a new file to price it.",
        action: null,
      };
    case "unsupported":
      return {
        tone: "error",
        title: "GRIDGO cannot measure this file",
        body: "Upload the artwork as a PDF, PNG, JPEG or WebP file to price it by colour.",
        action: null,
      };
    case "multiple_file_page_range_unsupported":
      return {
        tone: "error",
        title: "A page range works with one file",
        body: "Clear the page range, or keep one document on this item and add the others as separate items.",
        action: null,
      };
    case "duplicate_artwork_unsupported":
      return {
        tone: "error",
        title: "The same file is attached twice",
        body: "Remove the extra one and choose how many copies or sets you want instead.",
        action: null,
      };
    default:
      return {
        tone: "info",
        title: "Checking the colour on each page",
        body: "Each page's price appears here when GRIDGO has finished.",
        action: null,
      };
  }
}

/** Still measuring: the screen polls the basket while this is true. */
export function colourPending(pricing: ColourPricing | null | undefined): boolean {
  return pricing?.status === "pending";
}

/**
 * Checkout refuses this line until it is priced (`colour_price_check_required`
 * or `colour_analysis_required`). A one-colour service never blocks.
 */
export function colourBlocksCheckout(line: Pick<CartLineRecord, "listing" | "colourPricing">): boolean {
  if (!linePricedByColour(line)) return false;
  return line.colourPricing?.status !== "priced";
}

/** Blocked only by a page with no shop rate, which the client cannot fix alone. */
export function colourAwaitsPriceCheck(line: Pick<CartLineRecord, "listing" | "colourPricing">): boolean {
  return colourBlocksCheckout(line) && line.colourPricing?.status === "needs_price_check";
}

/** The one-colour warning when the file has colour; never a block. */
export function oneColourWarning(pricing: ColourPricing | null | undefined): string | null {
  const warning = pricing?.warning?.trim();
  return warning || null;
}

/** Why a colour line has no total yet, in one line (basket rows). */
export function colourLineReason(pricing: ColourPricing | null | undefined): string {
  if (pricing?.status === "needs_price_check") return "A page needs a price check. Operations is checking it with the shop.";
  if (pricing?.status === "pending") return "Measuring the colour on each page…";
  if (pricing?.status === "quantity_mode_required") return "Choose copies or sets on its Artwork to see the price.";
  const view = colourStatusView(pricing);
  return view ? `${view.title}. Open its Artwork.` : "Open its Artwork to finish the colour check.";
}

/**
 * Under a page that has a level but no price yet: why. Prices arrive for the
 * whole line at once, so a priced-level page waits on whatever the line waits on.
 */
export function pageUnpricedNote(pricing: Pick<ColourPricing, "status"> | null | undefined): string {
  if (pricing?.status === "quantity_mode_required") return "Priced once you choose copies or sets";
  if (pricing?.status === "needs_price_check") return "Priced after the price check";
  return "Not priced yet";
}

/** The pages that need a price check, for a count on the basket row. */
export function pagesNeedingPriceCheck(pricing: ColourPricing | null | undefined): ColourPage[] {
  return (pricing?.pages ?? []).filter(pageNeedsPriceCheck);
}

/** The highest coverage on the line, for a one-line summary. */
export function colourSummary(pricing: ColourPricing | null | undefined): string | null {
  const pages = pricing?.pages ?? [];
  if (!pages.length) return null;
  const strong = pages.filter((page) => page.strongColourBps > 0).length;
  if (!strong) return `${plural(pages.length, "page", "pages")}, no strong colour`;
  return `${plural(pages.length, "page", "pages")}, ${strong} with strong colour`;
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

export type ColourRefusal = { code: "colour_price_check_required" | "colour_analysis_required"; lineId: string | null };

/** Checkout's 409 for an unfinished colour price, with the line it is about. */
export function colourRefusalOf(body: unknown): ColourRefusal | null {
  if (typeof body !== "object" || !body) return null;
  const { error, lineId, details } = body as { error?: unknown; lineId?: unknown; details?: { lineId?: unknown } };
  if (error !== "colour_price_check_required" && error !== "colour_analysis_required") return null;
  const id = typeof lineId === "string" ? lineId : typeof details?.lineId === "string" ? details.lineId : null;
  return { code: error, lineId: id };
}
