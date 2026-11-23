/**
 * Express document printing (gridgo-client#442/#443; gridgo-api
 * `docs/EXPRESS_API.md`). Pure rules only: what a print setting defaults to,
 * which warnings a file raises, when the "Looks right" tick still holds, and
 * how the shop sheet orders shops. Screens and the store compose these.
 */

import type { DetectedArtwork, ExpressFareLimit, ExpressShop, StoredFile } from "@/lib/api";

/** A3 is priced by each shop and paid after the shop accepts (B26328C8). */
export type ExpressPaper = "a4" | "short" | "long" | "a3";
export type ExpressColour = "bw" | "colour";
export type ExpressSides = "one" | "two";
export type ExpressLayout = "fit_to_paper" | "actual_size_centered" | "actual_size_original_position";
export type ExpressWarningCode = "paper_size_mismatch" | "rgb_colour";
export type ExpressShopSort = "nearest" | "top_rated" | "fewest_jobs";
export type ExpressFulfilment = "pickup" | "delivery";

/** One file's print settings, exactly the fields `POST /express/drafts` takes per file. */
export type ExpressPrint = {
  fileId: string;
  copies: number;
  /** Null prints every page. */
  pageRange: string | null;
  paper: ExpressPaper;
  colour: ExpressColour;
  sides: ExpressSides;
  layout: ExpressLayout;
  note: string;
  acceptedWarnings: ExpressWarningCode[];
};

export type { ExpressShop };

export const EXPRESS_MAX_FILES = 20;
export const EXPRESS_MAX_COPIES = 999;
export const EXPRESS_NOTE_MAX = 300;

export const PAPER_OPTIONS: { value: ExpressPaper; label: string; detail: string }[] = [
  { value: "a4", label: "A4", detail: "210 × 297 mm" },
  { value: "short", label: "Short", detail: "8.5 × 11 in" },
  { value: "long", label: "Long", detail: "8.5 × 13 in" },
  { value: "a3", label: "A3", detail: "297 × 420 mm" },
];

export const LAYOUT_OPTIONS: { value: ExpressLayout; label: string }[] = [
  { value: "fit_to_paper", label: "Fit to page" },
  { value: "actual_size_centered", label: "Actual size, centred" },
  { value: "actual_size_original_position", label: "Actual size, top-left" },
];

export const SORT_OPTIONS: { value: ExpressShopSort; label: string }[] = [
  { value: "nearest", label: "Nearest" },
  { value: "top_rated", label: "Top rated" },
  { value: "fewest_jobs", label: "Fewest jobs" },
];

export function paperLabel(paper: ExpressPaper): string {
  return PAPER_OPTIONS.find((option) => option.value === paper)?.label ?? paper;
}

export function layoutLabel(layout: ExpressLayout): string {
  return LAYOUT_OPTIONS.find((option) => option.value === layout)?.label ?? layout;
}

/** Width over height of the sheet, portrait. Long is 8.5 × 13 in. */
export function paperAspect(paper: ExpressPaper): number {
  if (paper === "short") return 8.5 / 11;
  if (paper === "long") return 8.5 / 13;
  return 210 / 297;
}

/**
 * The Express paper a file's own page size names, when it names one.
 * gridgo-api reads Letter (8.5 × 11 in) as short and Legal (8.5 × 14 in) has no
 * Express paper; Long is 8.5 × 13 in, which no standard name covers, so it is
 * matched by its measured size.
 */
export function filePaper(detected: DetectedArtwork | null | undefined): ExpressPaper | null {
  if (!detected) return null;
  const name = detected.pageSize?.toLowerCase() ?? null;
  // A3 is never a default: it changes who prices the job and when it is paid.
  if (name === "a4") return "a4";
  if (name === "letter") return "short";
  const width = detected.widthMilli;
  const height = detected.heightMilli;
  if (width != null && height != null && width > 0 && height > 0) {
    const short = Math.min(width, height) / 1000;
    const long = Math.max(width, height) / 1000;
    if (Math.abs(short - 215.9) <= 2 && Math.abs(long - 330.2) <= 2) return "long";
  }
  return null;
}

/** A file's page size as words, for the file card ("A4", "Letter", "216 × 330 mm"). */
export function filePaperName(detected: DetectedArtwork | null | undefined): string | null {
  if (!detected) return null;
  const paper = filePaper(detected);
  if (paper) return paperLabel(paper);
  if (detected.pageSize) return detected.pageSize;
  if (detected.widthMilli && detected.heightMilli) {
    return `${Math.round(detected.widthMilli / 1000)} × ${Math.round(detected.heightMilli / 1000)} mm`;
  }
  return null;
}

/** Pages GRIDGO counted in the file; images are one page. Null means unreadable. */
export function filePageCount(file: Pick<StoredFile, "detected" | "detectedContentType">): number | null {
  if (["image/png", "image/jpeg", "image/webp"].includes(file.detectedContentType)) return 1;
  const count = file.detected?.pageCount;
  return typeof count === "number" && Number.isSafeInteger(count) && count > 0 ? count : null;
}

/** A file Express can take: uploaded, ready, and with a page count the server read. */
export function expressFileProblem(file: StoredFile): string | null {
  if (file.state !== "ready") return "Still uploading";
  if (file.artworkCheck?.status === "failed") return "This file could not be read";
  if (filePageCount(file) == null) return "Pages could not be counted. Save it as a PDF and upload again.";
  return null;
}

export function defaultPrint(file: StoredFile): ExpressPrint {
  return {
    fileId: file.fileId,
    copies: 1,
    pageRange: null,
    paper: filePaper(file.detected) ?? "a4",
    colour: "bw",
    sides: "one",
    layout: "fit_to_paper",
    note: "",
    acceptedWarnings: [],
  };
}

export type ExpressWarning = {
  code: ExpressWarningCode;
  /** One short line. */
  message: string;
  /** The change that clears it, if there is one. */
  fix: { label: string; change: Partial<ExpressPrint> } | null;
};

/**
 * What GRIDGO tells the client before printing this file this way. A paper
 * mismatch offers the file's own paper when Express has it; an RGB file in
 * colour offers B&W. Accepting a warning keeps it in `acceptedWarnings`,
 * which the draft stores with the order.
 */
export function expressWarnings(file: StoredFile, print: ExpressPrint): ExpressWarning[] {
  const warnings: ExpressWarning[] = [];
  const own = filePaper(file.detected);
  const ownName = filePaperName(file.detected);
  if (ownName && own !== print.paper) {
    warnings.push({
      code: "paper_size_mismatch",
      message: `File is ${ownName}, printing on ${paperLabel(print.paper)}`,
      fix: own ? { label: `Use ${paperLabel(own)}`, change: { paper: own } } : null,
    });
  }
  const mode = file.detected?.colorMode;
  if (print.colour === "colour" && (mode === "rgb" || mode === "mixed")) {
    warnings.push({
      code: "rgb_colour",
      message: "Screen colours (RGB) may print a little duller",
      fix: { label: "Use B&W", change: { colour: "bw" } },
    });
  }
  return warnings;
}

/** Warnings the client has not accepted yet. */
export function openWarnings(file: StoredFile, print: ExpressPrint): ExpressWarning[] {
  return expressWarnings(file, print).filter((warning) => !print.acceptedWarnings.includes(warning.code));
}

/**
 * Applies a settings change. Accepted warnings that no longer apply are
 * dropped, so the order only stores what the client actually saw.
 */
export function changePrint(file: StoredFile, print: ExpressPrint, change: Partial<ExpressPrint>): ExpressPrint {
  const next = { ...print, ...change };
  const live = expressWarnings(file, next).map((warning) => warning.code);
  return { ...next, acceptedWarnings: next.acceptedWarnings.filter((code) => live.includes(code)) };
}

export type ExpressChoices = {
  prints: ExpressPrint[];
  supplierId: string | null;
  /** Set when GRIDGO picks ("Just print it"); the shop is then the draft's answer. */
  fareLimit?: ExpressFareLimit | null;
  fulfilment: ExpressFulfilment;
  dropoff: { lat: number; lng: number; label?: string | null } | null;
};

/**
 * The "Looks right" tick belongs to one exact set of choices. gridgo-api
 * fingerprints files, print settings, shop and fulfilment the same way, and
 * refuses checkout (`409 express_preview_required`) when they moved, so any
 * change clears the tick.
 */
export function choicesKey(choices: ExpressChoices): string {
  return JSON.stringify({
    prints: choices.prints.map((print) => [
      print.fileId,
      print.copies,
      print.pageRange ?? "",
      print.paper,
      print.colour,
      print.sides,
      print.layout,
      print.note.trim(),
      [...print.acceptedWarnings].sort(),
    ]),
    supplierId: choices.fareLimit ? null : choices.supplierId,
    fareLimit: choices.fareLimit ?? null,
    fulfilment: choices.fulfilment,
    dropoff: choices.fulfilment === "delivery" && choices.dropoff
      ? [choices.dropoff.lat, choices.dropoff.lng, choices.dropoff.label ?? ""]
      : null,
  });
}

/**
 * What "Looks right" vouches for: the preview — files and their print
 * settings — not the printer or the place. Picking a printer after Preview
 * must not take the tick away; checkout still sends the current draft's own
 * confirmation, which is what gridgo-api fingerprints.
 */
export function previewKey(prints: ExpressPrint[]): string {
  return choicesKey({ prints, supplierId: null, fulfilment: "pickup", dropoff: null });
}

export function looksRightHolds(tickedKey: string | null, choices: Pick<ExpressChoices, "prints"> & Partial<ExpressChoices>): boolean {
  return tickedKey != null && tickedKey === previewKey(choices.prints);
}

/** Every file's open warning must be accepted or fixed before the tick can be given. */
export function canTickLooksRight(files: StoredFile[], prints: ExpressPrint[]): boolean {
  if (!prints.length) return false;
  return prints.every((print) => {
    const file = files.find((row) => row.fileId === print.fileId);
    return file != null && openWarnings(file, print).length === 0;
  });
}

/**
 * The shop sheet's order. gridgo-api sorts the same way (`expressShopList`);
 * the sheet reads one list and re-sorts it on the phone so switching sort is
 * instant. Ties go to the nearer shop. The first New shop is placed second in
 * the two non-distance sorts so a new shop is seen without jumping the best.
 */
export function sortExpressShops(shops: ExpressShop[], sort: ExpressShopSort): ExpressShop[] {
  const rows = [...shops].sort((a, b) =>
    (sort === "top_rated"
      ? (b.rating?.average ?? 0) - (a.rating?.average ?? 0)
      : sort === "fewest_jobs"
        ? a.jobsAhead - b.jobsAhead
        : 0)
    || a.distanceMeters - b.distanceMeters
    || a.supplierId.localeCompare(b.supplierId));
  if (sort !== "nearest" && rows.length > 1) {
    const index = rows.findIndex((row) => row.isNew);
    if (index >= 0) {
      const [row] = rows.splice(index, 1);
      rows.splice(1, 0, row);
    }
  }
  return rows;
}

export function distanceLabel(meters: number): string {
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** Printed pages for one file: selected pages × copies. Duplex does not change the count. */
export function printedPages(totalPages: number, print: ExpressPrint): number {
  return selectedPages(totalPages, print.pageRange) * print.copies;
}

/** How many pages a range selects; an invalid range selects none. */
export function selectedPages(total: number, range: string | null): number {
  if (!range || !range.trim()) return total;
  const intervals: [number, number][] = [];
  for (const part of range.split(",")) {
    const match = /^\s*([1-9]\d*)\s*(?:-\s*([1-9]\d*)\s*)?$/.exec(part);
    if (!match) return 0;
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start > end || end > total) return 0;
    intervals.push([start, end]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let count = 0;
  let last = 0;
  for (const [start, end] of intervals) {
    const from = Math.max(start, last + 1);
    if (end >= from) count += end - from + 1;
    last = Math.max(last, end);
  }
  return count;
}

/** The one-line summary a folded settings row shows. */
export function printSummary(print: ExpressPrint, totalPages: number | null): {
  pages: string;
  paper: string;
  printAs: string;
  layout: string;
  note: string;
} {
  return {
    pages: print.pageRange ? `Pages ${print.pageRange}` : totalPages ? `All ${totalPages}` : "All",
    paper: paperLabel(print.paper),
    printAs: `${print.colour === "bw" ? "B&W" : "Colour"}, ${print.sides === "one" ? "one side" : "two sides"}`,
    layout: layoutLabel(print.layout),
    note: print.note.trim() ? print.note.trim() : "None",
  };
}

/** Paper in millimetres, portrait. */
export const PAPER_MM: Record<ExpressPaper, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  short: { width: 215.9, height: 279.4 },
  long: { width: 215.9, height: 330.2 },
  a3: { width: 297, height: 420 },
};

/** Fit to page leaves the printer's usual margin. */
const FIT_MARGIN = 0.05;

/**
 * Where the first page lands on the sheet, as shares of the sheet's width and
 * height. Fit to page scales it inside the margin; actual size keeps the
 * file's millimetres, centred or from the top-left corner, and may run off
 * the paper (that is what the paper warning is for). With no size read, the
 * page is drawn as if it matched the paper.
 */
export function artworkBox(
  paper: ExpressPaper,
  layout: ExpressLayout,
  fileSize: { widthMilli: number; heightMilli: number } | null,
): { left: number; top: number; width: number; height: number } {
  const sheet = PAPER_MM[paper];
  const file = fileSize && fileSize.widthMilli > 0 && fileSize.heightMilli > 0
    ? { width: fileSize.widthMilli / 1000, height: fileSize.heightMilli / 1000 }
    : sheet;
  if (layout === "fit_to_paper") {
    const room = { width: sheet.width * (1 - 2 * FIT_MARGIN), height: sheet.height * (1 - 2 * FIT_MARGIN) };
    const scale = Math.min(room.width / file.width, room.height / file.height);
    const width = (file.width * scale) / sheet.width;
    const height = (file.height * scale) / sheet.height;
    return { left: (1 - width) / 2, top: (1 - height) / 2, width, height };
  }
  const width = file.width / sheet.width;
  const height = file.height / sheet.height;
  if (layout === "actual_size_centered") return { left: (1 - width) / 2, top: (1 - height) / 2, width, height };
  return { left: 0, top: 0, width, height };
}

/** "Ready 2:15 PM" today, "Ready Fri 9:00 AM" otherwise, in Davao time. Null without a promise. */
export function readyLine(readyAt: string | null | undefined, now: Date = new Date()): string | null {
  if (!readyAt) return null;
  const date = new Date(readyAt);
  if (Number.isNaN(date.getTime())) return null;
  const zone = { timeZone: "Asia/Manila" } as const;
  const time = date.toLocaleTimeString("en-PH", { ...zone, hour: "numeric", minute: "2-digit" });
  const sameDay = date.toLocaleDateString("en-CA", zone) === now.toLocaleDateString("en-CA", zone);
  return sameDay ? `Ready ${time}` : `Ready ${date.toLocaleDateString("en-PH", { ...zone, weekday: "short" })} ${time}`;
}
