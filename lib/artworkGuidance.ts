/**
 * Artwork guidance: resolution and colour mode, judged by GRIDGO per product
 * type at the size ordered (gridgo-api `docs/ARTWORK_GUIDANCE_API.md`,
 * gridgo-client#242).
 *
 * Both are warnings, never blocks. GRIDGO owns every number: the targets are
 * Super Admin's (`settings.artworkGuidance`), and the effective DPI and the
 * warnings come on the cart line. Nothing here works out a threshold of its
 * own — a file that cannot be read at all is the structural check's business
 * (`artworkCheckFailure`), and stays a block.
 */

import type {
  ArtworkColorMode,
  ArtworkGuidance,
  ArtworkGuidanceFile,
  ArtworkGuidanceRule,
  ArtworkGuidanceSettings,
  ArtworkWarning,
  PrepareFileAdvice,
} from "@/lib/api";

const MILLI = 1000;
const MM_PER_INCH = 25.4;

/** Said wherever a warning can be accepted. */
export const REPRINT_NOTE =
  "If you accept a warning and the print looks blurry or off-colour because of it, the free reprint promise does not cover it.";

/**
 * The product type's targets, or null on an API that has none. A product type
 * without an entry of its own uses the default.
 */
export function guidanceRule(
  settings: ArtworkGuidanceSettings | null | undefined,
  subcategoryCode: string | null | undefined,
): ArtworkGuidanceRule | null {
  if (!settings?.default) return null;
  return (subcategoryCode && settings.subcategories?.[subcategoryCode]) || settings.default;
}

export type GuideRow = { id: "colour" | "resolution"; title: string; body: string };

/**
 * "Prepare your file", before anything is uploaded: one row for colour and
 * one for resolution. Null when there is nothing to prepare for — no rule, or
 * a product type that checks neither (3D model files).
 */
export function prepareFileGuide(
  rule: ArtworkGuidanceRule | null,
  size?: { milli: { width: number; height: number } | null; label?: string | null },
): GuideRow[] | null {
  if (!rule) return null;
  if (rule.minimumDpi == null && rule.acceptsRgb) return null;
  const rows: GuideRow[] = [];
  rows.push(
    rule.acceptsRgb
      ? {
          id: "colour",
          title: "RGB accepted",
          body: "This product prints from RGB files, so export your design as it is.",
        }
      : {
          id: "colour",
          title: "Save it in CMYK",
          body: "Printers mix cyan, magenta, yellow and black. An RGB file can print duller than it looks on screen, most of all bright blues and greens.",
        },
  );
  if (rule.minimumDpi != null) {
    const pixels = size?.milli ? pixelsAt(size.milli, rule.minimumDpi) : null;
    const label = size?.label?.trim();
    rows.push({
      id: "resolution",
      title: `${rule.minimumDpi} DPI at the printed size`,
      body: pixels
        ? `For ${label || sizeWords(size!.milli!)} that is about ${pixels.width} × ${pixels.height} pixels. A picture saved from a phone screen is usually smaller.`
        : "Measured at the size you order, so a file that is sharp on a flyer can look soft on a poster.",
    });
  }
  return rows;
}

/**
 * The guide for a per-page product with GRIDGO's resolution advice
 * (`listing.prepareFile`, gridgo-api `docs/COLOUR_PRICING_API.md`): plans and
 * documents want 300 to 600 DPI, and resolution never changes their price.
 * It takes the place of the per-type resolution row.
 */
export function withPrepareFileAdvice(rows: GuideRow[] | null, advice: PrepareFileAdvice | null | undefined): GuideRow[] | null {
  if (!advice?.recommendedDpi) return rows;
  const { min, max } = advice.recommendedDpi;
  const row: GuideRow = {
    id: "resolution",
    title: `${min} to ${max} DPI`,
    body: advice.resolutionAffectsPrice
      ? "Recommended for sharp lines and small text."
      : "Recommended for sharp lines and small text. Resolution does not change the price.",
  };
  return [...(rows ?? []).filter((entry) => entry.id !== "resolution"), row];
}

/** The pixels a file needs to reach `dpi` at this size. */
export function pixelsAt(sizeMilli: { width: number; height: number }, dpi: number) {
  const inches = (milli: number) => milli / MILLI / MM_PER_INCH;
  return {
    width: Math.round(inches(sizeMilli.width) * dpi),
    height: Math.round(inches(sizeMilli.height) * dpi),
  };
}

/** "210 × 297 mm"; centimetres once a side reaches a metre. */
export function sizeWords(size: { width: number; height: number }): string {
  const unit = Math.max(size.width, size.height) >= 1000 * MILLI ? 10 : 1;
  const one = (milli: number) => Math.round((milli / MILLI / unit) * 10) / 10;
  return `${one(size.width)} × ${one(size.height)} ${unit === 10 ? "cm" : "mm"}`;
}

/** The ordered size GRIDGO measured the line at, in the shape the rest of the app uses. */
export function orderedSizeMilli(guidance: ArtworkGuidance | null | undefined) {
  const size = guidance?.orderedSize;
  return size?.widthMilli && size.heightMilli ? { width: size.widthMilli, height: size.heightMilli } : null;
}

export function colorModeLabel(mode: ArtworkColorMode | null | undefined): string | null {
  switch (mode) {
    case "rgb":
      return "RGB";
    case "cmyk":
      return "CMYK";
    case "grayscale":
      return "Greyscale";
    case "mixed":
      return "RGB and CMYK mixed";
    default:
      return null;
  }
}

/** This file's entry in the line's guidance, if GRIDGO judged it. */
export function fileGuidance(
  guidance: ArtworkGuidance | null | undefined,
  fileId: string,
): ArtworkGuidanceFile | null {
  return guidance?.files?.find((file) => file.fileId === fileId) ?? null;
}

export type FileFact = { id: "colour" | "resolution"; label: string; value: string };

/**
 * What GRIDGO read from the file, at the size ordered: its colour mode and the
 * resolution it prints at. Only what is known; an empty list says nothing.
 */
export function fileFacts(
  file: ArtworkGuidanceFile,
  guidance: Pick<ArtworkGuidance, "minimumDpi">,
): FileFact[] {
  const facts: FileFact[] = [];
  const mode = colorModeLabel(file.colorMode);
  if (mode) facts.push({ id: "colour", label: "Colour", value: mode });
  if (file.effectiveDpi != null) {
    const target = guidance.minimumDpi != null ? `, ${guidance.minimumDpi} recommended` : "";
    facts.push({
      id: "resolution",
      label: "Resolution",
      value: `${file.effectiveDpi} DPI at the size ordered${target}`,
    });
  }
  return facts;
}

export type WarningCopy = { title: string; body: string; accept: string };

/** Plain words for one warning, with the figures GRIDGO measured. */
export function warningCopy(warning: ArtworkWarning | { code: string }): WarningCopy {
  if (warning.code === "low_resolution" && "effectiveDpi" in warning) {
    return {
      title: "Lower resolution than recommended",
      body: `This file prints at ${warning.effectiveDpi} DPI at the size you ordered. ${warning.minimumDpi} DPI is recommended for this product, so it may look soft or blurry.`,
      accept: "Print it at this resolution",
    };
  }
  if (warning.code === "color_mode" && "colorMode" in warning) {
    const expected = colorModeLabel(warning.expectedColorMode) ?? "CMYK";
    return {
      title: warning.colorMode === "mixed" ? "RGB and CMYK mixed" : "RGB file",
      body: `This product prints in ${expected}. Colours from RGB can print duller than they look on screen.`,
      accept: "Print it in these colours",
    };
  }
  return {
    title: "Check this file",
    body: "GRIDGO flagged something about this file that may affect how it prints.",
    accept: "Print it as it is",
  };
}

export function isAccepted(warning: { acceptedAt?: string | null }): boolean {
  return Boolean(warning.acceptedAt);
}

/**
 * The whole acceptance list to send when one warning is ticked or unticked.
 * The route replaces the line's acceptances, so every one already held goes
 * again, and only warnings the line has now.
 */
export function acceptanceAfter(
  guidance: ArtworkGuidance,
  change: { fileId: string; code: string; accept: boolean },
): { fileId: string; code: string }[] {
  const list: { fileId: string; code: string }[] = [];
  for (const file of guidance.files ?? []) {
    for (const warning of file.warnings ?? []) {
      const changed = file.fileId === change.fileId && warning.code === change.code;
      const keep = changed ? change.accept : isAccepted(warning);
      if (keep) list.push({ fileId: file.fileId, code: warning.code });
    }
  }
  return list;
}

/** When a warning was accepted, in Davao time: "15 Oct, 3:42 PM". */
export function acceptedOn(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}


export type OrderFileGuidance = {
  file: ArtworkGuidanceFile;
  minimumDpi: number | null;
  /** The item it belongs to, for a job with several. */
  itemName: string;
};

/**
 * The record frozen at checkout for each file on an order, by file id.
 * Orders from before the record carry null and give an empty map.
 */
export function orderFileGuidance(
  items: { itemName: string; artworkGuidance?: ArtworkGuidance | null }[] | null | undefined,
): Map<string, OrderFileGuidance> {
  const byFile = new Map<string, OrderFileGuidance>();
  for (const item of items ?? []) {
    for (const file of item.artworkGuidance?.files ?? []) {
      byFile.set(file.fileId, { file, minimumDpi: item.artworkGuidance?.minimumDpi ?? null, itemName: item.itemName });
    }
  }
  return byFile;
}

/** "Accepted 15 Oct, 3:42 PM" or "Not accepted", as the order records it. */
export function acceptanceLine(warning: { acceptedAt?: string | null }): string {
  return warning.acceptedAt ? `Accepted ${acceptedOn(warning.acceptedAt)}` : "Not accepted";
}
