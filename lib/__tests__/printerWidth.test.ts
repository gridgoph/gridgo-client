import type { CatalogItem, CatalogOptionGroup } from "@/lib/api";
import {
  parseWidthFeet,
  printerCapFeet,
  printerCapLine,
  printerWidthProblem,
  requestedWidthFeet,
  widestPrinterCapFeet,
} from "@/lib/printerWidth";

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
    { id: "opt_3x6", label: "Small", priceModifierMinor: 0, specBinding: { fieldCode: "size", value: "3x6" }, sortOrder: 0 },
    { id: "opt_8x4", label: "8x4", priceModifierMinor: 0, specBinding: null, sortOrder: 1 },
  ],
};

const TARP: Pick<CatalogItem, "printerMaxWidthFeet" | "measureUnit" | "optionGroups"> = {
  printerMaxWidthFeet: 7,
  measureUnit: "ft",
  optionGroups: [SIZE_GROUP],
};

describe("the printer's widest print", () => {
  it("reads a published cap as a plain line", () => {
    expect(printerCapFeet(TARP)).toBe(7);
    expect(printerCapLine(TARP)).toBe("Prints up to 7 ft wide");
  });

  it("says nothing when the cap is missing or out of range", () => {
    expect(printerCapLine({ printerMaxWidthFeet: null })).toBeNull();
    expect(printerCapLine({})).toBeNull();
    expect(printerCapLine(null)).toBeNull();
    expect(printerCapFeet({ printerMaxWidthFeet: 0 })).toBeNull();
    expect(printerCapFeet({ printerMaxWidthFeet: 21 })).toBeNull();
    expect(printerCapFeet({ printerMaxWidthFeet: 6.5 })).toBeNull();
  });

  it("takes the widest cap across a match's listings", () => {
    expect(
      widestPrinterCapFeet([
        { printerMaxWidthFeet: 7 },
        { printerMaxWidthFeet: null },
        { printerMaxWidthFeet: 10 },
      ]),
    ).toBe(10);
    expect(widestPrinterCapFeet([{ printerMaxWidthFeet: null }, {}])).toBeNull();
  });
});

describe("the client's width, read the way GRIDGO reads it", () => {
  it("parses sizes the way gridgo-api does", () => {
    expect(parseWidthFeet("4x8")).toBe(4);
    expect(parseWidthFeet("3.5 × 6")).toBe(3.5);
    expect(parseWidthFeet("5 ft")).toBe(5);
    expect(parseWidthFeet("5")).toBe(5);
    expect(parseWidthFeet("Matte")).toBeNull();
    expect(parseWidthFeet("")).toBeNull();
  });

  it("prefers the typed measurement, in the listing's own unit", () => {
    expect(requestedWidthFeet(TARP, { width: 8000, height: 4000 }, { grp_size: "opt_3x6" })).toBe(8);
    // Three metres is a little under ten feet.
    expect(
      requestedWidthFeet({ ...TARP, measureUnit: "m" }, { width: 3000, height: 1000 }, {}),
    ).toBeCloseTo(9.84, 2);
  });

  it("falls back to the bound size, then an option's own label", () => {
    expect(requestedWidthFeet(TARP, null, { grp_size: "opt_3x6" }, "3x6")).toBe(3);
    expect(requestedWidthFeet(TARP, null, { grp_size: "opt_3x6" })).toBe(3);
    expect(requestedWidthFeet(TARP, null, { grp_size: "opt_8x4" })).toBe(8);
  });

  it("has no width until one is given", () => {
    expect(requestedWidthFeet(TARP, null, {})).toBeNull();
    expect(requestedWidthFeet({ ...TARP, measureUnit: null }, { width: 8000 }, {})).toBeNull();
  });
});

describe("a job wider than the printer", () => {
  it("is fine at or under the cap", () => {
    expect(printerWidthProblem(TARP, 7)).toBeNull();
    expect(printerWidthProblem(TARP, 3)).toBeNull();
  });

  it("is never refused without a cap or a width", () => {
    expect(printerWidthProblem({ ...TARP, printerMaxWidthFeet: null }, 30)).toBeNull();
    expect(printerWidthProblem(TARP, null)).toBeNull();
  });

  it("says both numbers and offers turning it round when the other side fits", () => {
    const problem = printerWidthProblem(TARP, 8, { width: 8000, height: 4000 });
    expect(problem?.title).toBe("Too wide for this printer");
    expect(problem?.body).toBe(
      "This printer prints up to 7 ft wide, and yours is 8 ft wide. Swap the width and height — 4 ft wide fits — or make it 7 ft wide or less.",
    );
    expect(problem?.short).toBe("Too wide for this printer. Make it 7 ft wide or less first.");
  });

  it("does not offer a turn that would still be too wide", () => {
    const problem = printerWidthProblem(TARP, 10, { width: 10000, height: 9000 });
    expect(problem?.body).toBe(
      "This printer prints up to 7 ft wide, and yours is 10 ft wide. Make it 7 ft wide or less.",
    );
  });

  it("states a converted width without float noise", () => {
    const problem = printerWidthProblem({ ...TARP, measureUnit: "m" }, 3 / 0.3048);
    expect(problem?.body).toContain("yours is 9.84 ft wide");
  });
});
