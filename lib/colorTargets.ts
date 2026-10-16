/**
 * Exact colours (gridgo-client#249, gridgo-api `docs/EXACT_COLOURS_API.md`).
 *
 * A client can name up to eight colours on an item — a Pantone code, CMYK
 * percentages or a hex value, each with a label — and GRIDGO reads the
 * colours each uploaded file uses, so the two sit side by side.
 *
 * The parsers mirror gridgo-api's `src/color-targets.js` so the editor can
 * show the normalised value before saving and refuse what GRIDGO would. The
 * API stays the judge: its `invalid_color_targets` reasons are worded here.
 *
 * Pantone is text. GRIDGO ships no Pantone colour data, so a Pantone target
 * has a swatch only when the client gives an approximate hex, and nothing
 * here converts a code to a colour.
 */

import { ApiError } from "@/lib/api";

export const MAX_COLOR_TARGETS = 8;
export const COLOR_LABEL_MAX = 40;
const PANTONE_MAX = 40;

const PANTONE_SUFFIXES = new Set(["C", "U", "M", "CP", "UP", "XGC", "TCX", "TPX", "TPG", "TN", "TSX", "HC", "Q"]);

export type ColorTargetFormat = "pantone" | "cmyk" | "hex";
export type Cmyk = { c: number; m: number; y: number; k: number };

/** A target as every read returns it, normalised by GRIDGO. */
export type ColorTarget = {
  label: string;
  format: ColorTargetFormat | (string & {});
  /** What to show as text: `PANTONE 201 C`, `C0 M100 Y65 K34`, `#1A5FB4`. */
  value: string;
  cmyk: Cmyk | null;
  hex: string | null;
  /** Null for a Pantone with no approximate hex: text only. */
  swatchHex: string | null;
  /** True for CMYK and a Pantone's own hex; false for a hex target; null without a swatch. */
  swatchApproximate: boolean | null;
};

/** What a write sends: a label and exactly one format. */
export type ColorTargetInput =
  | { label: string; pantone: string; approximateHex?: string }
  | { label: string; cmyk: Cmyk }
  | { label: string; hex: string };

/** One colour GRIDGO read from a file. */
export type ArtworkColor = {
  kind: "spot" | "process" | "pixels" | (string & {});
  name: string | null;
  space: "cmyk" | "rgb" | "gray" | (string & {}) | null;
  cmyk: Cmyk | null;
  hex: string | null;
  uses: number | null;
  /** A PNG colour's share of the opaque pixels, 10000 = all. */
  shareBps: number | null;
};

export type ArtworkColorsRead = {
  version: number;
  status: "read" | "partial" | "unknown" | (string & {});
  reasons: string[];
  colors: ArtworkColor[];
};

/** One uploaded file's colours, as a cart line or order line carries them. */
export type ArtworkColorsEntry = { fileId: string; colors: ArtworkColorsRead };

// ---- parsing, as gridgo-api does it ----

/** `#RGB` or `#RRGGBB`, with or without the hash, any case. Returns `#RRGGBB` or null. */
export function parseHex(value: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  return `#${digits.toUpperCase()}`;
}

/**
 * CMYK typed as text: four numbers (`0 100 65 34`, `0/100/65/34`,
 * `cmyk(0%, 100%, 65%, 34%)`) or lettered in any order (`C0 M100 Y65 K34`).
 * Whole percentages only; a decimal is refused, never rounded.
 */
export function parseCmyk(value: string): Cmyk | null {
  if (value.length > 80) return null;
  let body = value.trim().toLowerCase();
  const wrapped = /^cmyk\s*\((.*)\)$/.exec(body);
  if (wrapped) body = wrapped[1].trim();
  const percent = (number: number) => (Number.isInteger(number) && number >= 0 && number <= 100 ? number : null);

  const NUMBER = "(\\d+(?:\\.\\d+)?)\\s*%?";
  const letteredPattern = new RegExp(`([cmyk])\\s*[:=]?\\s*${NUMBER}`, "g");
  const lettered = [...body.matchAll(letteredPattern)];
  if (lettered.length && body.replace(letteredPattern, "").replace(/[\s,;/]/g, "") === "") {
    if (lettered.length !== 4 || new Set(lettered.map((match) => match[1])).size !== 4) return null;
    const read: Record<string, number | null> = {};
    for (const match of lettered) read[match[1]] = percent(Number(match[2]));
    const { c, m, y, k } = read;
    return c != null && m != null && y != null && k != null ? { c, m, y, k } : null;
  }
  const gap = "(?:\\s*[,;/]\\s*|\\s+)";
  const plain = new RegExp(`^${NUMBER}${gap}${NUMBER}${gap}${NUMBER}${gap}${NUMBER}$`).exec(body);
  if (!plain) return null;
  const [c, m, y, k] = plain.slice(1).map((number) => percent(Number(number)));
  return c != null && m != null && y != null && k != null ? { c, m, y, k } : null;
}

/** One CMYK box: a whole number from 0 to 100, or null. */
export function parsePercent(value: string): number | null {
  const text = value.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const number = Number(text);
  return number <= 100 ? number : null;
}

export function formatCmyk({ c, m, y, k }: Cmyk): string {
  return `C${c} M${m} Y${y} K${k}`;
}

/** The plain screen formula. It ignores paper, ink and profiles: always approximate. */
export function cmykSwatchHex({ c, m, y, k }: Cmyk): string {
  const channel = (ink: number) => Math.round((255 * (100 - ink) * (100 - k)) / 10_000);
  return `#${[c, m, y].map((ink) => channel(ink).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** `pms 201c` → `PANTONE 201 C`. Shape only: GRIDGO has no Pantone list to look a code up in. */
export function parsePantone(value: string): string | null {
  if (value.length > 80) return null;
  let body = value.normalize("NFKC").replace(/[®™]/g, " ").trim().replace(/\s+/g, " ");
  body = body.replace(/^(?:pantone|pms)(?![a-z])\.?\s*/i, "");
  if (!body || body.length > PANTONE_MAX || !/^[A-Za-z0-9][A-Za-z0-9 \-./]*$/.test(body)) return null;
  // A hex value typed in the wrong box is not a Pantone code.
  if (/^(?=.*[a-f])[0-9a-f]{6}$/i.test(body)) return null;
  body = body.replace(/^(\d[\d-]*)([A-Za-z]+)$/, "$1 $2");
  const words = body.split(" ").map((word) => {
    if (PANTONE_SUFFIXES.has(word.toUpperCase())) return word.toUpperCase();
    if (/^[A-Za-z]+$/.test(word)) return word[0].toUpperCase() + word.slice(1).toLowerCase();
    return word.toUpperCase();
  });
  if (!words.some((word) => /\d/.test(word) || (/^[A-Za-z]+$/.test(word) && !PANTONE_SUFFIXES.has(word.toUpperCase())))) {
    return null;
  }
  return `PANTONE ${words.join(" ")}`;
}

// ---- the editor ----

/** What the editor holds while a colour is being typed. CMYK is four boxes. */
export type ColorDraft = {
  label: string;
  format: ColorTargetFormat;
  pantone: string;
  approximateHex: string;
  cmyk: { c: string; m: string; y: string; k: string };
  hex: string;
};

export const EMPTY_DRAFT: ColorDraft = {
  label: "",
  format: "pantone",
  pantone: "",
  approximateHex: "",
  cmyk: { c: "", m: "", y: "", k: "" },
  hex: "",
};

export const FORMAT_LABELS: Record<ColorTargetFormat, string> = {
  pantone: "Pantone",
  cmyk: "CMYK",
  hex: "Hex",
};

export type DraftField = "label" | "pantone" | "approximateHex" | "cmyk" | "hex";

export type DraftCheck =
  | { ok: true; input: ColorTargetInput; target: ColorTarget }
  | { ok: false; field: DraftField; message: string; incomplete: boolean };

export const COLOR_COPY = {
  labelRequired: "Give this colour a short label, such as Logo red.",
  labelTooLong: `Keep the label to ${COLOR_LABEL_MAX} characters.`,
  labelInvalid: "Use plain text for the label.",
  pantone: "Type a Pantone code, such as 185 C or 18-1663 TPX.",
  approximateHex: "Type the approximate colour as a hex value, such as #E4002B, or leave it empty.",
  cmyk: "Each of C, M, Y and K is a whole number from 0 to 100.",
  hex: "Type a hex colour, such as #1A5FB4.",
  tooMany: `You can name up to ${MAX_COLOR_TARGETS} exact colours.`,
} as const;

/**
 * Check a draft the way GRIDGO will, and return what it will store.
 * `incomplete` is a field not filled in yet, which the editor does not shout
 * about until the client tries to add the colour.
 */
export function checkDraft(draft: ColorDraft): DraftCheck {
  const label = draft.label.trim();
  const valueCheck = checkValue(draft);
  if (!valueCheck.ok) return valueCheck;
  if (!label) return { ok: false, field: "label", message: COLOR_COPY.labelRequired, incomplete: true };
  if ([...label].length > COLOR_LABEL_MAX) {
    return { ok: false, field: "label", message: COLOR_COPY.labelTooLong, incomplete: false };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(label)) {
    return { ok: false, field: "label", message: COLOR_COPY.labelInvalid, incomplete: false };
  }
  return { ok: true, input: { ...valueCheck.input, label } as ColorTargetInput, target: { ...valueCheck.target, label } };
}

type ValueCheck =
  | { ok: true; input: Omit<ColorTargetInput, "label">; target: Omit<ColorTarget, "label"> }
  | { ok: false; field: DraftField; message: string; incomplete: boolean };

/** The value alone: what the preview draws while the label is still empty. */
export function checkValue(draft: ColorDraft): ValueCheck {
  if (draft.format === "pantone") {
    const typed = draft.pantone.trim();
    const code = typed ? parsePantone(typed) : null;
    if (!code) return { ok: false, field: "pantone", message: COLOR_COPY.pantone, incomplete: !typed };
    const hexText = draft.approximateHex.trim();
    const swatchHex = hexText ? parseHex(hexText) : null;
    if (hexText && !swatchHex) {
      return { ok: false, field: "approximateHex", message: COLOR_COPY.approximateHex, incomplete: false };
    }
    return {
      ok: true,
      input: { pantone: typed, ...(swatchHex ? { approximateHex: swatchHex } : {}) },
      target: { format: "pantone", value: code, cmyk: null, hex: null, swatchHex, swatchApproximate: swatchHex ? true : null },
    };
  }
  if (draft.format === "cmyk") {
    const boxes = [draft.cmyk.c, draft.cmyk.m, draft.cmyk.y, draft.cmyk.k];
    const [c, m, y, k] = boxes.map(parsePercent);
    if (c == null || m == null || y == null || k == null) {
      return { ok: false, field: "cmyk", message: COLOR_COPY.cmyk, incomplete: boxes.some((box) => !box.trim()) };
    }
    const cmyk = { c, m, y, k };
    return {
      ok: true,
      input: { cmyk },
      target: { format: "cmyk", value: formatCmyk(cmyk), cmyk, hex: null, swatchHex: cmykSwatchHex(cmyk), swatchApproximate: true },
    };
  }
  const typed = draft.hex.trim();
  const hex = typed ? parseHex(typed) : null;
  if (!hex) return { ok: false, field: "hex", message: COLOR_COPY.hex, incomplete: !typed };
  return {
    ok: true,
    input: { hex },
    target: { format: "hex", value: hex, cmyk: null, hex, swatchHex: hex, swatchApproximate: false },
  };
}

/**
 * A pasted CMYK in one box (`0/100/65/34`, `C0 M100 Y65 K34`) fills all four.
 * Null when the text is not a whole CMYK value, so the box keeps what was typed.
 */
export function spreadCmyk(text: string): ColorDraft["cmyk"] | null {
  if (!/[\s,;/:=a-z]/i.test(text.trim())) return null;
  const cmyk = parseCmyk(text);
  return cmyk ? { c: String(cmyk.c), m: String(cmyk.m), y: String(cmyk.y), k: String(cmyk.k) } : null;
}

/** A saved target back into the editor, to change it. */
export function draftFromTarget(target: ColorTarget): ColorDraft {
  if (target.format === "cmyk" && target.cmyk) {
    const { c, m, y, k } = target.cmyk;
    return { ...EMPTY_DRAFT, label: target.label, format: "cmyk", cmyk: { c: String(c), m: String(m), y: String(y), k: String(k) } };
  }
  if (target.format === "hex") return { ...EMPTY_DRAFT, label: target.label, format: "hex", hex: target.hex ?? target.value };
  return {
    ...EMPTY_DRAFT,
    label: target.label,
    format: "pantone",
    pantone: target.value,
    approximateHex: target.swatchHex ?? "",
  };
}

/**
 * A saved target as a write sends it again. A PATCH replaces the whole list,
 * so every target the client keeps goes back with the one they changed.
 */
export function targetInput(target: ColorTarget): ColorTargetInput {
  if (target.format === "cmyk" && target.cmyk) return { label: target.label, cmyk: { ...target.cmyk } };
  if (target.format === "hex") return { label: target.label, hex: target.hex ?? target.value };
  return {
    label: target.label,
    pantone: target.value,
    ...(target.swatchHex ? { approximateHex: target.swatchHex } : {}),
  };
}

/** The list a cart line or production item carries; `[]` on an older API. */
export function colorTargetsOf(line: { colorTargets?: ColorTarget[] | null } | null | undefined): ColorTarget[] {
  return Array.isArray(line?.colorTargets) ? line.colorTargets : [];
}

// ---- what a swatch may claim ----

export type SwatchKind = "exact" | "approximate" | "none";

export function swatchKind(target: Pick<ColorTarget, "swatchHex" | "swatchApproximate">): SwatchKind {
  if (!target.swatchHex) return "none";
  return target.swatchApproximate === false ? "exact" : "approximate";
}

/** The words beside a swatch, so the swatch is never the only thing that says it. */
export function swatchNote(target: Pick<ColorTarget, "format" | "swatchHex" | "swatchApproximate">): string {
  const kind = swatchKind(target);
  if (kind === "none") return "Pantone code only, no swatch";
  if (kind === "exact") return "Screen colour";
  return target.format === "pantone" ? "Your approximate swatch" : "Approximate on screen";
}

export const SCREEN_PRINT_NOTE =
  "Screens and printers show colour differently. Swatches here are a guide on your screen, not a printed match. The shop works from the codes and values you type.";

// ---- the API's refusals ----

const REASON_COPY: Record<string, string> = {
  not_a_list: "GRIDGO could not read the colour list. Try again.",
  too_many: COLOR_COPY.tooMany,
  not_an_object: "GRIDGO could not read one of the colours. Remove it and add it again.",
  one_format_required: "Give each colour one value: a Pantone code, CMYK values or a hex value.",
  unknown_field: "GRIDGO could not read one of the colours. Remove it and add it again.",
  label_required: COLOR_COPY.labelRequired,
  label_too_long: COLOR_COPY.labelTooLong,
  label_invalid: COLOR_COPY.labelInvalid,
  pantone_invalid: COLOR_COPY.pantone,
  cmyk_invalid: COLOR_COPY.cmyk,
  hex_invalid: COLOR_COPY.hex,
  approximate_hex_not_allowed: "Only a Pantone colour takes an approximate swatch.",
};

/**
 * GRIDGO's `invalid_color_targets` in plain words, naming the colour it is
 * about ("Logo red: Type a hex colour…"). Null for any other error.
 */
export function colorTargetsRefusal(error: unknown, labels: readonly string[] = []): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body as { error?: string; details?: { field?: string; reason?: string } } | null;
  if (body?.error !== "invalid_color_targets") return null;
  const reason = body.details?.reason ?? "";
  const field = body.details?.field ?? "";
  // A hex refusal on `approximateHex` is about the Pantone's swatch, not a hex target.
  const copy =
    reason === "hex_invalid" && field.endsWith(".approximateHex")
      ? COLOR_COPY.approximateHex
      : REASON_COPY[reason] ?? "GRIDGO could not save these colours. Check each one and try again.";
  const index = /^colorTargets\[(\d+)\]/.exec(field);
  if (!index) return copy;
  const at = Number(index[1]);
  const name = labels[at]?.trim();
  return `${name || `Colour ${at + 1}`}: ${copy}`;
}

// ---- the colours GRIDGO read from a file ----

const READ_REASON_COPY: Record<string, string> = {
  not_read_for_this_file_type: "GRIDGO does not read colours from this file type. A PDF or PNG can be read.",
  not_read_at_upload: "This file was uploaded before GRIDGO read colours. Upload it again to read them.",
  embedded_images_not_read: "Pictures placed in the PDF were not read.",
  colour_space_not_read: "Some colours, such as gradients, patterns or Lab colours, were not read.",
  stream_filter_not_supported: "Part of the file is stored in a way GRIDGO does not read.",
  content_not_readable: "GRIDGO could not decode the file's colour data.",
  file_larger_than_inspection_window: "Only the first part of this large file was read.",
  inspection_limit: "GRIDGO stopped reading partway through this large file.",
  more_colours_than_listed: "The file uses more colours than are listed here.",
  no_colours_declared: "The file sets no colours GRIDGO can read.",
  no_opaque_pixels: "The image has no visible pixels.",
  no_dominant_colours: "No colour covers enough of the image to list.",
};

export type ArtworkColorsView =
  | { kind: "unknown"; headline: string; notes: string[] }
  | { kind: "read"; colors: ArtworkColor[]; notes: string[] };

/** How one file's colour read is drawn. `unknown` is a sentence, never an empty palette. */
export function artworkColorsView(read: ArtworkColorsRead | null | undefined): ArtworkColorsView {
  const reasons = read?.reasons ?? [];
  const notes = reasons.map((code) => READ_REASON_COPY[code]).filter((line): line is string => Boolean(line));
  const colors = read?.colors ?? [];
  if (!read || read.status === "unknown" || !colors.length) {
    const typeNote = reasons.includes("not_read_for_this_file_type") || reasons.includes("not_read_at_upload");
    return {
      kind: "unknown",
      headline: "We could not read the colours in this file",
      notes: notes.length ? notes : typeNote ? [] : ["GRIDGO could not find colours to list in this file."],
    };
  }
  return { kind: "read", colors, notes };
}

/** A read colour's own words: the spot name, else its CMYK or hex. */
export function artworkColorLabel(color: ArtworkColor): string {
  if (color.kind === "spot" && color.name) return color.name;
  if (color.space === "cmyk" && color.cmyk) return formatCmyk(color.cmyk);
  return color.hex ?? color.name ?? "Unnamed colour";
}

/** The second line under a read colour: what kind it is, and how much. */
export function artworkColorDetail(color: ArtworkColor): string {
  if (color.kind === "spot") return color.uses === 0 ? "Spot colour, not used" : "Spot colour";
  if (color.kind === "pixels" && color.shareBps != null) {
    const share = color.shareBps / 100;
    return `${share < 1 ? "Under 1" : Math.round(share)}% of the image`;
  }
  if (color.space === "gray") return "Grey";
  if (color.space === "rgb") return "RGB";
  if (color.space === "cmyk") return "CMYK";
  return "Colour";
}

/**
 * Which files state this exact colour: a spot colour of the same Pantone
 * code, the same CMYK values, or the same screen hex. Exact matches only — a
 * near colour is for the shop's eye, and "close enough" here would read as a
 * promise about the print. A file that was not fully read proves nothing
 * either way, so a colour not found is simply not marked.
 */
export function targetFoundIn(target: ColorTarget, entries: readonly ArtworkColorsEntry[]): string[] {
  const pantone = target.format === "pantone" ? parsePantone(target.value) : null;
  return entries
    .filter((entry) =>
      (entry.colors?.colors ?? []).some((color) => {
        if (pantone) return color.kind === "spot" && color.name != null && parsePantone(color.name) === pantone;
        if (target.format === "cmyk" && target.cmyk && color.cmyk) {
          return (["c", "m", "y", "k"] as const).every((key) => color.cmyk?.[key] === target.cmyk?.[key]);
        }
        if (target.format === "hex" && target.hex && color.space !== "cmyk" && color.kind !== "spot") {
          return color.hex?.toUpperCase() === target.hex.toUpperCase();
        }
        return false;
      }),
    )
    .map((entry) => entry.fileId);
}

/**
 * How a file is named beside its colours: the client's own label for it, the
 * name it was uploaded with, else its place among the item's files.
 */
export function colorFileNamer(
  attachments: readonly { kind: string; fileId?: string; label?: string }[],
  uploadedName?: (fileId: string) => string | null | undefined,
): (fileId: string) => string {
  const files = attachments.filter((entry) => entry.kind === "file" && entry.fileId);
  return (fileId) => {
    const at = files.findIndex((entry) => entry.fileId === fileId);
    const label = at >= 0 ? files[at].label?.trim() : undefined;
    return label || uploadedName?.(fileId)?.trim() || (at >= 0 && files.length > 1 ? `File ${at + 1}` : "Your file");
  };
}
