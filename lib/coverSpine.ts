import type {
  ArtworkAttachment,
  CartLineRecord,
  CoverChoice,
  CoverSpineInput,
  CoverSpineRecord,
} from "@/lib/api";

/**
 * A hardbound book's cover and spine (gridgo-client#247, gridgo-api
 * `docs/HARDBOUND_COVER_API.md`).
 *
 * The client chooses how the cover is made and types what the spine says.
 * The shop works out the cover and spine dimensions itself, so there is no
 * template and no spine-width sum here. Only a listing with `coverSpineForm`
 * asks; every other product looks as it did.
 *
 * GRIDGO takes the form whole and replaces what the line had, so a half-typed
 * form stays on the phone (it still draws the live preview) and is sent once
 * every required field passes the same rules the API applies.
 */

export const COVER_CHOICES: { code: CoverChoice; label: string; hint: string }[] = [
  {
    code: "first_page",
    label: "Use the first page of my file",
    hint: "The shop prints the cover from page 1 of the file you uploaded.",
  },
  {
    code: "separate_file",
    label: "Upload a separate cover page",
    hint: "Your cover design as its own file, kept with this item.",
  },
  {
    code: "text_only",
    label: "Plain cover, text only",
    hint: "No printed design. The cover is lettered with the spine details.",
  },
];

/** The label a separate cover page goes onto the item's files with. */
export const COVER_FILE_LABEL = "Cover";

export const SPINE_LIMITS = { institutionCode: 24, title: 200, author: 160 } as const;
export const SPINE_YEAR_MIN = 1950;
export const SPINE_YEAR_MAX = 2100;

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type SpineField = "institutionCode" | "title" | "author" | "month" | "year";

/** The form as the client is filling it in: every field may still be empty. */
export type CoverSpineDraft = {
  cover: CoverChoice | null;
  /** The separate cover page on this item, once one is uploaded. */
  coverFileId: string | null;
  institutionCode: string;
  title: string;
  author: string;
  month: number | null;
  /** Typed, so it can be half a year. */
  year: string;
};

export const EMPTY_COVER_SPINE: CoverSpineDraft = {
  cover: null,
  coverFileId: null,
  institutionCode: "",
  title: "",
  author: "",
  month: null,
  year: "",
};

function isCoverChoice(value: unknown): value is CoverChoice {
  return value === "first_page" || value === "separate_file" || value === "text_only";
}

/** What GRIDGO holds, as a form to edit. Nothing given is an empty form. */
export function draftFromRecord(record: CoverSpineRecord | null | undefined): CoverSpineDraft {
  if (!record || record.status !== "given" || !record.spine) return EMPTY_COVER_SPINE;
  return {
    cover: isCoverChoice(record.cover) ? record.cover : null,
    coverFileId: record.coverFileId ?? null,
    institutionCode: record.spine.institutionCode ?? "",
    title: record.spine.title,
    author: record.spine.author,
    month: record.spine.month,
    year: String(record.spine.year),
  };
}

/**
 * One line of text as GRIDGO stores it: no line breaks, tabs or other control
 * characters, trimmed, and runs of spaces as one.
 */
export function cleanSpineText(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Characters, not bytes, the way GRIDGO counts its limits. */
function characters(text: string): number {
  return [...text].length;
}

function wholeYear(text: string): number | null {
  const clean = text.trim();
  if (!/^\d{4}$/.test(clean)) return null;
  return Number(clean);
}

const FIELD_NAMES: Record<SpineField, string> = {
  institutionCode: "institution code",
  title: "title",
  author: "author",
  month: "month",
  year: "year",
};

/**
 * What is wrong with one field, in plain words, or null. A required field
 * still empty is only an error once the client has tried to save
 * (`showRequired`); before that it is simply not filled in yet.
 */
export function spineFieldError(
  field: SpineField,
  draft: CoverSpineDraft,
  { showRequired = false }: { showRequired?: boolean } = {},
): string | null {
  if (field === "month") {
    if (draft.month == null) return showRequired ? "Choose the month on the spine." : null;
    return Number.isInteger(draft.month) && draft.month >= 1 && draft.month <= 12 ? null : "Choose a month.";
  }
  if (field === "year") {
    const text = draft.year.trim();
    if (!text) return showRequired ? "Enter the year on the spine." : null;
    const year = wholeYear(text);
    if (year == null || year < SPINE_YEAR_MIN || year > SPINE_YEAR_MAX) {
      return `Enter a year from ${SPINE_YEAR_MIN} to ${SPINE_YEAR_MAX}, such as 2026.`;
    }
    return null;
  }
  const text = cleanSpineText(draft[field]);
  if (!text) {
    if (field === "institutionCode" || !showRequired) return null;
    return field === "title" ? "Enter the title on the spine." : "Enter the author on the spine.";
  }
  const limit = SPINE_LIMITS[field];
  if (characters(text) > limit) return `Keep the ${FIELD_NAMES[field]} to ${limit} characters.`;
  return null;
}

export const SPINE_FIELDS: SpineField[] = ["institutionCode", "title", "author", "month", "year"];

/** Why the form cannot be sent yet, if it cannot: the cover, then each field. */
export function coverSpineProblem(draft: CoverSpineDraft): string | null {
  if (!draft.cover) return "Choose how the cover is made.";
  if (draft.cover === "separate_file" && !draft.coverFileId) return "Upload the cover page, or choose another cover.";
  for (const field of SPINE_FIELDS) {
    const error = spineFieldError(field, draft, { showRequired: true });
    if (error) return error;
  }
  return null;
}

/** The body GRIDGO takes, or null while the form is not complete and valid. */
export function coverSpineInput(draft: CoverSpineDraft): CoverSpineInput | null {
  if (coverSpineProblem(draft) || !draft.cover || draft.month == null) return null;
  const institutionCode = cleanSpineText(draft.institutionCode);
  return {
    cover: draft.cover,
    ...(draft.cover === "separate_file" && draft.coverFileId ? { coverFileId: draft.coverFileId } : {}),
    spine: {
      institutionCode: institutionCode || null,
      title: cleanSpineText(draft.title),
      author: cleanSpineText(draft.author),
      month: draft.month,
      year: Number(draft.year.trim()),
    },
  };
}

/** Whether the form on screen says something GRIDGO does not hold yet. */
export function coverSpineDirty(draft: CoverSpineDraft, record: CoverSpineRecord | null | undefined): boolean {
  const held = draftFromRecord(record);
  const same = (a: string, b: string) => cleanSpineText(a) === cleanSpineText(b);
  return !(
    draft.cover === held.cover &&
    (draft.cover !== "separate_file" || draft.coverFileId === held.coverFileId) &&
    same(draft.institutionCode, held.institutionCode) &&
    same(draft.title, held.title) &&
    same(draft.author, held.author) &&
    draft.month === held.month &&
    draft.year.trim() === held.year.trim()
  );
}

/** "October 2026" — or as much of it as is filled in. */
export function spineDateLabel(month: number | null, year: string | number): string {
  const monthName = month != null && month >= 1 && month <= 12 ? MONTH_NAMES[month - 1] : "";
  return [monthName, String(year).trim()].filter(Boolean).join(" ");
}

export type SpineLine = { field: "institutionCode" | "title" | "author" | "date"; text: string };

/**
 * The spine top to bottom, as the doc gives it: institution code (skipped
 * when empty), title, author, then the month name and year.
 */
export function spineLines(draft: Pick<CoverSpineDraft, "institutionCode" | "title" | "author" | "month" | "year">): SpineLine[] {
  const lines: SpineLine[] = [];
  const code = cleanSpineText(draft.institutionCode);
  if (code) lines.push({ field: "institutionCode", text: code });
  lines.push({ field: "title", text: cleanSpineText(draft.title) });
  lines.push({ field: "author", text: cleanSpineText(draft.author) });
  lines.push({ field: "date", text: spineDateLabel(draft.month, draft.year) });
  return lines;
}

/** The spine on one line, for lists: GRIDGO's own `spineSummary` format. */
export function spineSummaryOf(draft: Parameters<typeof spineLines>[0]): string {
  return spineLines(draft)
    .map((line) => line.text)
    .filter(Boolean)
    .join(" | ");
}

/** Whether this item's product asks for the form at all. */
export function lineAsksCoverSpine(line: Pick<CartLineRecord, "listing"> | null | undefined): boolean {
  return line?.listing?.coverSpineForm === true;
}

function given(record: CoverSpineRecord | null | undefined): record is Extract<CoverSpineRecord, { status: "given" }> {
  return record?.status === "given" && record.spine != null;
}

/** Checkout will refuse this line: GRIDGO requires the form and it has none. */
export function lineMissingCoverSpine(line: Pick<CartLineRecord, "coverSpine" | "coverSpineRequired">): boolean {
  return line.coverSpineRequired === true && !given(line.coverSpine);
}

/** How the cover was made, said as a record rather than a choice. */
export function coverRecordLabel(cover: string | null | undefined): string {
  switch (cover) {
    case "first_page":
      return "First page of the file";
    case "separate_file":
      return "Separate cover page";
    case "text_only":
      return "Plain cover, text only";
    default:
      return "As agreed with the shop";
  }
}

/** The spine of a form GRIDGO holds, on one line. */
export function recordSpineSummary(record: Extract<CoverSpineRecord, { status: "given" }>): string {
  return (
    record.spineSummary?.trim() ||
    spineSummaryOf({
      institutionCode: record.spine.institutionCode ?? "",
      title: record.spine.title,
      author: record.spine.author,
      month: record.spine.month,
      year: String(record.spine.year),
    })
  );
}

/** One basket line's cover and spine, under the item at checkout. Null when it does not ask. */
export function coverSpineLineSummary(
  line: Pick<CartLineRecord, "listing" | "coverSpine" | "coverSpineRequired">,
): { text: string; tone: "muted" | "warning" } | null {
  if (!lineAsksCoverSpine(line)) return null;
  if (given(line.coverSpine)) {
    return { text: `Cover: ${coverRecordLabel(line.coverSpine.cover)}. Spine: ${recordSpineSummary(line.coverSpine)}`, tone: "muted" };
  }
  return line.coverSpineRequired
    ? { text: "Add the cover and spine details on its Artwork.", tone: "warning" }
    : { text: "Cover and spine not given yet. Add them on its Artwork, or the shop asks you later.", tone: "muted" };
}

/** Rows for an agreed order line: what the shop prints. Null when the product does not ask. */
export function coverSpineRows(record: CoverSpineRecord | null | undefined): { label: string; value: string }[] | null {
  if (!record) return null;
  if (!given(record)) return [{ label: "Cover and spine", value: "Not given" }];
  return [
    { label: "Cover", value: coverRecordLabel(record.cover) },
    { label: "Spine", value: recordSpineSummary(record) },
  ];
}

/**
 * Which file on the item is the separate cover page: the one the client just
 * uploaded, else the one GRIDGO holds, else a file still labelled Cover (a
 * replacement keeps its label). Only a file still on the item counts.
 */
export function coverFileOnItem(
  entries: ArtworkAttachment[],
  draftFileId: string | null,
  record: CoverSpineRecord | null | undefined,
): string | null {
  const files = entries.flatMap((entry) => (entry.kind === "file" ? [entry] : []));
  const held = (id: string | null | undefined) => (id && files.some((file) => file.fileId === id) ? id : null);
  return (
    held(draftFileId) ??
    held(given(record) ? record.coverFileId : null) ??
    files.find((file, index) => index > 0 && file.label?.trim() === COVER_FILE_LABEL)?.fileId ??
    null
  );
}

// ---------------------------------------------------------------------------
// GRIDGO's refusals, in plain words
// ---------------------------------------------------------------------------

const SPINE_REASON_FIELD: Record<string, SpineField> = {
  "coverSpine.spine.institutionCode": "institutionCode",
  "coverSpine.spine.title": "title",
  "coverSpine.spine.author": "author",
  "coverSpine.spine.month": "month",
  "coverSpine.spine.year": "year",
};

type RefusalBody = { error?: unknown; field?: unknown; reason?: unknown; lineId?: unknown };

function bodyOf(body: unknown): RefusalBody | null {
  return body && typeof body === "object" ? (body as RefusalBody) : null;
}

/** `400 invalid_cover_spine`, said for the field it names. */
function invalidMessage(field: string, reason: string): string {
  const spineField = SPINE_REASON_FIELD[field];
  if (field === "coverSpine.cover" || reason === "unknown_cover") return "Choose one of the three ways to make the cover.";
  if (field === "coverSpine.coverFileId" || reason === "not_separate_file") {
    return reason === "required"
      ? "Upload the cover page, or choose another cover."
      : "Only a separate cover page takes a cover file. Choose that cover, or remove the file.";
  }
  if (spineField) {
    const name = FIELD_NAMES[spineField];
    switch (reason) {
      case "required":
        return `Enter the ${name} on the spine.`;
      case "too_long":
        return spineField === "institutionCode" || spineField === "title" || spineField === "author"
          ? `Keep the ${name} to ${SPINE_LIMITS[spineField]} characters.`
          : `Check the ${name}.`;
      case "out_of_range":
        return spineField === "year"
          ? `Enter a year from ${SPINE_YEAR_MIN} to ${SPINE_YEAR_MAX}.`
          : "Choose a month from January to December.";
      case "not_one_line":
        return `Keep the ${name} on one line.`;
      default:
        return `Check the ${name} and try again.`;
    }
  }
  return "GRIDGO could not keep those cover and spine details. Check each field and try again.";
}

/**
 * The plain words for a cover-and-spine refusal, or null when the error is
 * about something else.
 */
export function coverSpineErrorMessage(body: unknown): string | null {
  const refusal = bodyOf(body);
  switch (refusal?.error) {
    case "invalid_cover_spine":
      return invalidMessage(String(refusal.field ?? ""), String(refusal.reason ?? ""));
    case "cover_file_not_attached":
      return "The cover page is no longer one of this item's files. Upload it again, or choose another cover.";
    case "cover_spine_required":
      return "This book needs its cover and spine details before you place the order.";
    case "cover_spine_not_applicable":
      return "This product no longer takes cover and spine details.";
    default:
      return null;
  }
}

export const COVER_SPINE_CHECKOUT_CODES = [
  "cover_spine_required",
  "cover_spine_not_applicable",
  "cover_file_not_attached",
] as const;

export type CoverSpineRefusal = {
  code: (typeof COVER_SPINE_CHECKOUT_CODES)[number];
  lineId: string | null;
  message: string;
};

/** A checkout refusal about one line's cover and spine, or null. */
export function coverSpineRefusalOf(body: unknown): CoverSpineRefusal | null {
  const refusal = bodyOf(body);
  const code = COVER_SPINE_CHECKOUT_CODES.find((entry) => entry === refusal?.error);
  if (!code) return null;
  return {
    code,
    lineId: typeof refusal?.lineId === "string" ? refusal.lineId : null,
    message: coverSpineErrorMessage(body) ?? "",
  };
}

/** Said where a client is about to remove the file the cover is printed from. */
export const COVER_FILE_IN_USE =
  "This file is your cover page. Choose another cover below before you remove it.";
