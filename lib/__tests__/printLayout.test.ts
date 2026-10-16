import type { CatalogItem, CatalogOptionGroup, PrintLayoutCheck, PrintLayoutPaper } from "@/lib/api";
import {
  SCALE_NOTE,
  layoutAdvice,
  layoutLabel,
  layoutPreview,
  lineLayoutSummary,
  lineNeedsLayout,
  offeredLayouts,
  paperChange,
  paperGroupId,
  printLayoutRefusalOf,
  sizeLine,
  withPaper,
} from "@/lib/printLayout";

const A1: PrintLayoutPaper = { optionId: "opt_a1", label: "A1", widthMilli: 594000, heightMilli: 841000, pageSize: "A1" };
const A0: PrintLayoutPaper = { optionId: "opt_a0", label: "A0", widthMilli: 841000, heightMilli: 1189000, pageSize: "A0" };
const A0_PAGE = { widthMilli: 841000, heightMilli: 1189000 };

const SIZE_GROUP: CatalogOptionGroup = {
  id: "grp_size",
  name: "Size",
  kind: "spec",
  helpText: null,
  required: true,
  selectionMode: "single",
  sortOrder: 0,
  version: 1,
  options: [
    { id: "opt_a1", label: "A1", priceModifierMinor: 0, specBinding: { fieldCode: "size", value: "A1" }, sortOrder: 0 },
    { id: "opt_a0", label: "A0", priceModifierMinor: 0, specBinding: { fieldCode: "size", value: "A0" }, sortOrder: 1 },
  ],
};
const PAPER_GROUP: CatalogOptionGroup = {
  ...SIZE_GROUP,
  id: "grp_paper",
  name: "Paper",
  options: [{ id: "opt_white", label: "White", priceModifierMinor: 0, specBinding: { fieldCode: "material", value: "White" }, sortOrder: 0 }],
};
const LISTING: Pick<CatalogItem, "optionGroups" | "printLayouts"> = {
  optionGroups: [SIZE_GROUP, PAPER_GROUP],
  printLayouts: ["fit_to_paper", "actual_size_centered", "actual_size_original_position"],
};

function check(overrides: Partial<PrintLayoutCheck> = {}): PrintLayoutCheck {
  return {
    supportedLayouts: ["fit_to_paper", "actual_size_centered", "actual_size_original_position"],
    layout: "actual_size_centered",
    paper: A1,
    files: [{
      fileId: "file_1",
      page: { ...A0_PAGE, pageSize: "A0", orientation: "portrait", largestShortSideMilli: 841000, largestLongSideMilli: 1189000, mixedPageSizes: false },
      exceedsPaper: true,
    }],
    exceedsPaper: true,
    cutOff: true,
    scaleChanges: false,
    suggestedPaper: A0,
    unknown: [],
    ...overrides,
  };
}

describe("which layouts a listing offers", () => {
  it("offers only the known codes the shop marked, in the contract's order", () => {
    expect(offeredLayouts({ printLayouts: ["actual_size_centered", "fit_to_paper", "stretch"] })).toEqual([
      "fit_to_paper",
      "actual_size_centered",
    ]);
  });

  it("offers nothing on a product without layouts or an API from before them", () => {
    expect(offeredLayouts({ printLayouts: [] })).toEqual([]);
    expect(offeredLayouts({})).toEqual([]);
    expect(offeredLayouts(null)).toEqual([]);
  });

  it("says each layout in plain words, and an unknown code as itself", () => {
    expect(layoutLabel("fit_to_paper")).toBe("Fit to paper");
    expect(layoutLabel("actual_size_centered")).toBe("Actual size, centred");
    expect(layoutLabel("actual_size_original_position")).toBe("Actual size, in its original position");
    expect(layoutLabel("tile_across_pages")).toBe("Tile across pages");
  });

  it("asks for a layout only where one is offered and none, or a withdrawn one, is chosen", () => {
    expect(lineNeedsLayout({ printLayout: null, listing: LISTING as unknown as CatalogItem })).toBe(true);
    expect(lineNeedsLayout({ printLayout: "fit_to_paper", listing: LISTING as unknown as CatalogItem })).toBe(false);
    expect(lineNeedsLayout({ printLayout: "actual_size_centered", listing: { ...LISTING, printLayouts: ["fit_to_paper"] } as unknown as CatalogItem })).toBe(true);
    expect(lineNeedsLayout({ printLayout: null, listing: { ...LISTING, printLayouts: [] } as unknown as CatalogItem })).toBe(false);
  });
});

describe("the cut-off check, in words", () => {
  it("warns of a cut-off on the paper and offers the paper that fits", () => {
    const advice = layoutAdvice(check(), { listing: LISTING });
    expect(advice.cutOff).toEqual({
      title: "Parts of your page will be cut off on A1.",
      body: "Choose A0 to print it whole.",
      switchTo: A0,
    });
    expect(advice.scale).toBeNull();
  });

  it("keeps the suggestion as words but offers no switch when the listing does not have that paper", () => {
    const advice = layoutAdvice(check(), { listing: { ...LISTING, optionGroups: [PAPER_GROUP] } });
    expect(advice.cutOff?.body).toBe("Choose A0 to print it whole.");
    expect(advice.cutOff?.switchTo).toBeNull();
  });

  it("with no paper big enough, keeps the warning and points at Fit to paper", () => {
    const advice = layoutAdvice(check({ suggestedPaper: null }), { listing: LISTING });
    expect(advice.cutOff?.title).toBe("Parts of your page will be cut off on A1.");
    expect(advice.cutOff?.body).toBe("No paper this product offers is big enough. Choose Fit to paper to print it whole, scaled down.");
    expect(advice.cutOff?.switchTo).toBeNull();
  });

  it("follows the layout on screen ahead of the saved check", () => {
    const original = layoutAdvice(check({ layout: null, cutOff: null }), { layout: "actual_size_original_position", listing: LISTING });
    expect(original.cutOff?.title).toBe("Parts of your page will be cut off on A1.");
    const fit = layoutAdvice(check(), { layout: "fit_to_paper", listing: LISTING });
    expect(fit.cutOff).toBeNull();
    expect(fit.scale).toBe(SCALE_NOTE);
  });

  it("says the scale stays only when GRIDGO measured the page as the paper's size", () => {
    expect(layoutAdvice(check({ layout: "fit_to_paper", scaleChanges: true }), { listing: LISTING }).scale).toBe(SCALE_NOTE);
    expect(layoutAdvice(check({ layout: "fit_to_paper", scaleChanges: null }), { listing: LISTING }).scale).toBe(SCALE_NOTE);
    expect(layoutAdvice(check({ layout: "fit_to_paper", scaleChanges: false }), { listing: LISTING }).scale).toBe(
      "Your page is already A1, so the drawing scale stays as drawn.",
    );
    // Before there is any check (a new item), the note is still said.
    expect(layoutAdvice(null, { layout: "fit_to_paper" }).scale).toBe(SCALE_NOTE);
  });

  it("confirms a page that fits at actual size", () => {
    const advice = layoutAdvice(check({ exceedsPaper: false, cutOff: false, suggestedPaper: null }), { listing: LISTING });
    expect(advice.cutOff).toBeNull();
    expect(advice.fits).toBe("Your page fits on A1 and prints at its real size.");
  });

  it("says an unread page size plainly instead of guessing a fit", () => {
    const advice = layoutAdvice(
      check({
        files: [{ fileId: "file_1", page: null, exceedsPaper: null }],
        exceedsPaper: null,
        cutOff: null,
        suggestedPaper: null,
        unknown: [{ code: "page_size_unknown", fileId: "file_1" }],
      }),
      { listing: LISTING },
    );
    expect(advice.cutOff).toBeNull();
    expect(advice.fits).toBeNull();
    expect(advice.unknown).toEqual([
      "GRIDGO could not read the page size of your file, so it cannot tell whether anything will be cut off.",
    ]);
  });

  it("asks for the file only where asked to, and names an unread paper only once one is picked", () => {
    const empty = check({ files: [], exceedsPaper: null, cutOff: null, suggestedPaper: null, paper: null, unknown: [{ code: "no_artwork_file" }, { code: "paper_size_unknown" }] });
    expect(layoutAdvice(empty, { listing: LISTING, paperPicked: false }).unknown).toEqual([]);
    expect(layoutAdvice(empty, { listing: LISTING, askForFile: true, paperPicked: true }).unknown).toEqual([
      "Upload your file on the next step to see how it sits on the paper.",
      "GRIDGO could not read a paper size from this product's options, so it cannot check the fit.",
    ]);
  });

  it("notes pages of different sizes", () => {
    const base = check();
    const mixed = check({ files: [{ ...base.files[0], page: { ...base.files[0].page!, mixedPageSizes: true } }] });
    expect(layoutAdvice(mixed, { listing: LISTING }).mixed).toMatch(/pages of different sizes/);
  });
});

describe("switching to the suggested paper", () => {
  it("swaps the option inside the paper's own group and keeps the rest", () => {
    expect(withPaper(LISTING, ["opt_a1", "opt_white"], "opt_a0")).toEqual(["opt_white", "opt_a0"]);
  });

  it("re-reads the size the shop sees from the new paper", () => {
    const listing = { ...LISTING, id: "sci_1" } as unknown as CatalogItem;
    expect(
      paperChange(listing, { optionIds: ["opt_a1", "opt_white"], structuredSpec: { size: "A1", material: "White", finish: "", note: "kept" } }, "opt_a0"),
    ).toEqual({ optionIds: ["opt_white", "opt_a0"], structuredSpec: { size: "A0", material: "White", finish: "", note: "kept" } });
    expect(paperChange(listing, { optionIds: ["opt_a1"], structuredSpec: {} }, "opt_b4")).toBeNull();
  });

  it("refuses an option the listing does not offer", () => {
    expect(withPaper(LISTING, ["opt_a1"], "opt_b4")).toBeNull();
  });

  it("finds the group GRIDGO reads the paper from", () => {
    expect(paperGroupId(LISTING)).toBe("grp_size");
    expect(paperGroupId({ optionGroups: [PAPER_GROUP] })).toBeNull();
  });
});

describe("the preview's geometry", () => {
  it("fits a bigger page inside the paper, keeping its proportions, centred", () => {
    const shape = layoutPreview(A1, A0_PAGE, "fit_to_paper")!;
    expect(shape.paper).toEqual({ x: 0, y: 0, width: 594000, height: 841000 });
    expect(shape.scale).toBeCloseTo(594000 / 841000, 6);
    expect(shape.page.width).toBeCloseTo(594000, 0);
    expect(shape.page.height).toBeCloseTo(1189000 * (594000 / 841000), 0);
    expect(shape.page.x).toBeCloseTo(0, 0);
    expect(shape.page.y).toBeCloseTo((841000 - shape.page.height) / 2, 0);
    expect(shape.clipped).toBe(false);
    expect(shape.bounds).toEqual(shape.paper);
  });

  it("fits a smaller page up to the paper", () => {
    const shape = layoutPreview(A0, { widthMilli: 594000, heightMilli: 841000 }, "fit_to_paper")!;
    expect(shape.scale).toBeGreaterThan(1);
    expect(shape.clipped).toBe(false);
  });

  it("centres an actual-size page and shows how far it runs past each edge", () => {
    const shape = layoutPreview(A1, A0_PAGE, "actual_size_centered")!;
    expect(shape.scale).toBe(1);
    expect(shape.page).toEqual({ x: (594000 - 841000) / 2, y: (841000 - 1189000) / 2, width: 841000, height: 1189000 });
    expect(shape.clipped).toBe(true);
    // The drawing frames the whole page, paper inside it.
    expect(shape.bounds).toEqual({ x: -123500, y: -174000, width: 841000, height: 1189000 });
  });

  it("starts an original-position page from the paper's top-left corner, losing the far edges", () => {
    const shape = layoutPreview(A1, A0_PAGE, "actual_size_original_position")!;
    expect(shape.page).toEqual({ x: 0, y: 0, width: 841000, height: 1189000 });
    expect(shape.clipped).toBe(true);
    expect(shape.bounds).toEqual({ x: 0, y: 0, width: 841000, height: 1189000 });
  });

  it("turns the paper to match a landscape page", () => {
    const shape = layoutPreview(A1, { widthMilli: 1189000, heightMilli: 841000 }, "actual_size_centered")!;
    expect(shape.paper).toEqual({ x: 0, y: 0, width: 841000, height: 594000 });
    expect(shape.clipped).toBe(true);
  });

  it("counts a page within 1 mm of the paper as fitting, the same tolerance as GRIDGO", () => {
    expect(layoutPreview(A0, { widthMilli: 841022, heightMilli: 1188861 }, "actual_size_centered")!.clipped).toBe(false);
    expect(layoutPreview(A0, { widthMilli: 843000, heightMilli: 1189000 }, "actual_size_original_position")!.clipped).toBe(true);
  });

  it("draws nothing for a size it was not given", () => {
    expect(layoutPreview(A1, { widthMilli: 0, heightMilli: 841000 }, "fit_to_paper")).toBeNull();
  });

  it("states sizes to the millimetre", () => {
    expect(sizeLine({ widthMilli: 841022, heightMilli: 1188861 })).toBe("841 × 1189 mm");
  });
});

describe("checkout", () => {
  const listing = LISTING as unknown as CatalogItem;

  it("summarises each basket row's layout, a cut-off, or that one is owed", () => {
    expect(lineLayoutSummary({ printLayout: null, printLayoutCheck: null, listing })).toEqual({
      text: "No layout chosen yet. Open Artwork to choose one.",
      tone: "warning",
    });
    expect(lineLayoutSummary({ printLayout: "actual_size_centered", printLayoutCheck: check(), listing })).toEqual({
      text: "Layout: Actual size, centred. Parts are cut off on A1.",
      tone: "warning",
    });
    expect(lineLayoutSummary({ printLayout: "fit_to_paper", printLayoutCheck: check({ layout: "fit_to_paper", cutOff: false }), listing })).toEqual({
      text: "Layout: Fit to paper",
      tone: "muted",
    });
    expect(lineLayoutSummary({ printLayout: null, printLayoutCheck: null, listing: { ...listing, printLayouts: [] } })).toBeNull();
    expect(lineLayoutSummary({ printLayout: "fit_to_paper", printLayoutCheck: null, listing: { ...listing, printLayouts: ["actual_size_centered"] } })).toEqual({
      text: "This shop no longer prints Fit to paper. Open Artwork to choose another layout.",
      tone: "warning",
    });
  });

  it("reads GRIDGO's layout refusals and the line they are about", () => {
    expect(printLayoutRefusalOf({ error: "print_layout_required", lineId: "cline_1", supported: ["fit_to_paper"] })).toEqual({
      code: "print_layout_required",
      lineId: "cline_1",
    });
    expect(printLayoutRefusalOf({ error: "print_layout_not_supported" })).toEqual({ code: "print_layout_not_supported", lineId: null });
    expect(printLayoutRefusalOf({ error: "artwork_required", lineId: "cline_1" })).toBeNull();
    expect(printLayoutRefusalOf(null)).toBeNull();
  });
});
