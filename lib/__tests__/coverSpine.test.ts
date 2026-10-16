import type { CoverSpineRecord } from "@/lib/api";
import { placeOrderBlockers } from "@/lib/checkout";
import {
  EMPTY_COVER_SPINE,
  cleanSpineText,
  coverFileOnItem,
  coverSpineDirty,
  coverSpineErrorMessage,
  coverSpineInput,
  coverSpineLineSummary,
  coverSpineProblem,
  coverSpineRefusalOf,
  coverSpineRows,
  draftFromRecord,
  lineAsksCoverSpine,
  lineMissingCoverSpine,
  spineFieldError,
  spineLines,
  spineSummaryOf,
  type CoverSpineDraft,
} from "@/lib/coverSpine";

const FILLED: CoverSpineDraft = {
  cover: "text_only",
  coverFileId: null,
  institutionCode: "ABC-CS",
  title: "Flood Risk Mapping of a River Basin",
  author: "Sample Author",
  month: 10,
  year: "2026",
};

const GIVEN: CoverSpineRecord = {
  status: "given",
  cover: "separate_file",
  coverFileId: "file_cover",
  spine: { institutionCode: "ABC-CS", title: "Flood Risk Mapping of a River Basin", author: "Sample Author", month: 10, year: 2026 },
  spineDate: "October 2026",
  spineSummary: "ABC-CS | Flood Risk Mapping of a River Basin | Sample Author | October 2026",
};

const asks = { coverSpineForm: true } as never;

describe("the spine as the client types it", () => {
  it("reads top to bottom: code, title, author, then month and year", () => {
    expect(spineLines(FILLED).map((line) => line.text)).toEqual([
      "ABC-CS",
      "Flood Risk Mapping of a River Basin",
      "Sample Author",
      "October 2026",
    ]);
    expect(spineSummaryOf(FILLED)).toBe(GIVEN.spineSummary);
  });

  it("skips an empty institution code and keeps empty lines for their placeholders", () => {
    const lines = spineLines({ ...EMPTY_COVER_SPINE, title: "  A  thesis\tdraft " });
    expect(lines.map((line) => line.field)).toEqual(["title", "author", "date"]);
    expect(lines[0].text).toBe("A thesis draft");
    expect(spineLines({ ...EMPTY_COVER_SPINE, month: 3 })[2].text).toBe("March");
  });

  it("cleans text the way GRIDGO stores it", () => {
    expect(cleanSpineText("  Line one\nline two  ")).toBe("Line one line two");
  });
});

describe("checking the form as GRIDGO does", () => {
  it("sends a complete form whole, with no cover file unless the cover is separate", () => {
    expect(coverSpineInput(FILLED)).toEqual({
      cover: "text_only",
      spine: { institutionCode: "ABC-CS", title: FILLED.title, author: "Sample Author", month: 10, year: 2026 },
    });
    expect(coverSpineInput({ ...FILLED, institutionCode: "  " })?.spine.institutionCode).toBeNull();
    expect(coverSpineInput({ ...FILLED, coverFileId: "file_cover" })).not.toHaveProperty("coverFileId");
    expect(coverSpineInput({ ...FILLED, cover: "separate_file", coverFileId: "file_cover" })?.coverFileId).toBe("file_cover");
  });

  it("holds back a form that is not finished, saying the first thing missing", () => {
    expect(coverSpineInput({ ...FILLED, cover: null })).toBeNull();
    expect(coverSpineProblem({ ...FILLED, cover: null })).toBe("Choose how the cover is made.");
    expect(coverSpineProblem({ ...FILLED, cover: "separate_file" })).toBe("Upload the cover page, or choose another cover.");
    expect(coverSpineProblem({ ...FILLED, author: " " })).toBe("Enter the author on the spine.");
    expect(coverSpineProblem({ ...FILLED, month: null })).toBe("Choose the month on the spine.");
  });

  it("applies GRIDGO's limits, counting characters", () => {
    expect(spineFieldError("institutionCode", { ...FILLED, institutionCode: "X".repeat(25) })).toBe(
      "Keep the institution code to 24 characters.",
    );
    expect(spineFieldError("title", { ...FILLED, title: "é".repeat(200) })).toBeNull();
    expect(spineFieldError("title", { ...FILLED, title: "a".repeat(201) })).toBe("Keep the title to 200 characters.");
    expect(spineFieldError("author", { ...FILLED, author: "a".repeat(161) })).toBe("Keep the author to 160 characters.");
    expect(spineFieldError("year", { ...FILLED, year: "1949" })).toMatch(/1950 to 2100/);
    expect(spineFieldError("year", { ...FILLED, year: "2101" })).toMatch(/1950 to 2100/);
    expect(spineFieldError("year", { ...FILLED, year: "1950" })).toBeNull();
  });

  it("says nothing about an empty required field until the client tries to save", () => {
    expect(spineFieldError("title", EMPTY_COVER_SPINE)).toBeNull();
    expect(spineFieldError("title", EMPTY_COVER_SPINE, { showRequired: true })).toBe("Enter the title on the spine.");
    expect(spineFieldError("institutionCode", EMPTY_COVER_SPINE, { showRequired: true })).toBeNull();
  });

  it("knows when the form on screen differs from what GRIDGO holds", () => {
    const held = draftFromRecord(GIVEN);
    expect(held.year).toBe("2026");
    expect(coverSpineDirty(held, GIVEN)).toBe(false);
    expect(coverSpineDirty({ ...held, title: `  ${held.title} ` }, GIVEN)).toBe(false);
    expect(coverSpineDirty({ ...held, author: "Someone Else" }, GIVEN)).toBe(true);
    expect(coverSpineDirty(EMPTY_COVER_SPINE, null)).toBe(false);
    expect(draftFromRecord({ status: "not_given" })).toEqual(EMPTY_COVER_SPINE);
  });
});

describe("the separate cover page", () => {
  const entries = [
    { kind: "file" as const, fileId: "file_book" },
    { kind: "file" as const, fileId: "file_cover", label: "Cover" },
  ];

  it("is the file just uploaded, else the one GRIDGO holds, else a file still labelled Cover", () => {
    expect(coverFileOnItem(entries, "file_cover", null)).toBe("file_cover");
    expect(coverFileOnItem(entries, "file_gone", GIVEN)).toBe("file_cover");
    expect(coverFileOnItem([entries[0], { kind: "file", fileId: "file_new", label: "Cover" }], "file_gone", GIVEN)).toBe("file_new");
    // The book's own first file is never the cover, whatever its label.
    expect(coverFileOnItem([{ kind: "file", fileId: "file_book", label: "Cover" }], null, null)).toBeNull();
  });
});

describe("a basket line", () => {
  it("asks only when its listing says so", () => {
    expect(lineAsksCoverSpine({ listing: asks })).toBe(true);
    expect(lineAsksCoverSpine({ listing: { coverSpineForm: false } as never })).toBe(false);
    expect(lineAsksCoverSpine({ listing: null })).toBe(false);
    expect(coverSpineLineSummary({ listing: { coverSpineForm: false } as never, coverSpine: null })).toBeNull();
  });

  it("blocks checkout only while GRIDGO requires the form and it is missing", () => {
    expect(lineMissingCoverSpine({ coverSpine: null, coverSpineRequired: true })).toBe(true);
    expect(lineMissingCoverSpine({ coverSpine: null, coverSpineRequired: false })).toBe(false);
    expect(lineMissingCoverSpine({ coverSpine: null })).toBe(false);
    expect(lineMissingCoverSpine({ coverSpine: GIVEN, coverSpineRequired: true })).toBe(false);
    expect(placeOrderBlockers({ lineCount: 1, linesMissingArtwork: 0, linesMissingCoverSpine: 1, linesMissingDropoff: 0, referenceOk: true, hasProof: true, hasSettings: true })).toEqual(["cover_spine"]);
    expect(placeOrderBlockers({ lineCount: 1, linesMissingArtwork: 0, linesMissingDropoff: 0, referenceOk: true, hasProof: true, hasSettings: true })).toEqual([]);
  });

  it("says where the form stands under the item", () => {
    expect(coverSpineLineSummary({ listing: asks, coverSpine: GIVEN })).toEqual({
      text: `Cover: Separate cover page. Spine: ${GIVEN.spineSummary}`,
      tone: "muted",
    });
    expect(coverSpineLineSummary({ listing: asks, coverSpine: null, coverSpineRequired: true })?.tone).toBe("warning");
    expect(coverSpineLineSummary({ listing: asks, coverSpine: null })?.tone).toBe("muted");
  });
});

describe("the agreed order line", () => {
  it("reads the cover, the spine, or Not given", () => {
    expect(coverSpineRows(GIVEN)).toEqual([
      { label: "Cover", value: "Separate cover page" },
      { label: "Spine", value: GIVEN.spineSummary },
    ]);
    expect(coverSpineRows({ status: "not_given", cover: null, coverFileId: null, spine: null, spineDate: null, spineSummary: null })).toEqual([
      { label: "Cover and spine", value: "Not given" },
    ]);
    expect(coverSpineRows(null)).toBeNull();
    // An older record without the summary is drawn from its spine.
    expect(coverSpineRows({ ...GIVEN, spineSummary: undefined, cover: "first_page" })?.[1].value).toBe(GIVEN.spineSummary);
  });
});

describe("GRIDGO's refusals, in plain words", () => {
  it("names the field invalid_cover_spine points at", () => {
    expect(coverSpineErrorMessage({ error: "invalid_cover_spine", field: "coverSpine.spine.title", reason: "too_long" })).toBe(
      "Keep the title to 200 characters.",
    );
    expect(coverSpineErrorMessage({ error: "invalid_cover_spine", field: "coverSpine.spine.year", reason: "out_of_range" })).toBe(
      "Enter a year from 1950 to 2100.",
    );
    expect(coverSpineErrorMessage({ error: "invalid_cover_spine", field: "coverSpine.spine.author", reason: "required" })).toBe(
      "Enter the author on the spine.",
    );
    expect(coverSpineErrorMessage({ error: "invalid_cover_spine", field: "coverSpine.coverFileId", reason: "required" })).toBe(
      "Upload the cover page, or choose another cover.",
    );
    expect(coverSpineErrorMessage({ error: "invalid_cover_spine", field: "coverSpine.cover", reason: "unknown_cover" })).toBe(
      "Choose one of the three ways to make the cover.",
    );
  });

  it("explains a cover page that is no longer on the item, and ignores other errors", () => {
    expect(coverSpineErrorMessage({ error: "cover_file_not_attached", field: "coverSpine.coverFileId" })).toMatch(
      /no longer one of this item's files/,
    );
    expect(coverSpineErrorMessage({ error: "print_layout_required" })).toBeNull();
    expect(coverSpineErrorMessage(null)).toBeNull();
  });

  it("finds the line a checkout refusal is about", () => {
    expect(coverSpineRefusalOf({ error: "cover_spine_required", lineId: "cline_1", field: "coverSpine" })).toEqual({
      code: "cover_spine_required",
      lineId: "cline_1",
      message: "This book needs its cover and spine details before you place the order.",
    });
    expect(coverSpineRefusalOf({ error: "invalid_cover_spine" })).toBeNull();
  });
});
