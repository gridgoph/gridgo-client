import type { CatalogItem, CatalogOptionGroup } from "@/lib/api";
import { EMPTY_MEASUREMENT } from "@/lib/measurement";
import { SPECIAL_INSTRUCTIONS_MAX } from "@/lib/orderChanges";
import {
  firstListingProblem,
  listingProblemMessage,
  listingProblemScrollY,
  listingProblems,
  type ListingSheetInput,
} from "@/lib/listingValidation";

const SIZE: CatalogOptionGroup = {
  id: "g_size",
  name: "Size",
  kind: "spec",
  helpText: "Sheet size",
  required: true,
  selectionMode: "single",
  sortOrder: 0,
  version: 1,
  options: [
    {
      id: "o_a5",
      label: "A5",
      priceModifierMinor: 0,
      specBinding: { fieldCode: "size", value: "A5" },
      sortOrder: 0,
    },
  ],
};

const PAPER: CatalogOptionGroup = {
  id: "g_paper",
  name: "Paper",
  kind: "spec",
  helpText: null,
  required: true,
  selectionMode: "single",
  sortOrder: 1,
  version: 1,
  options: [
    {
      id: "o_matte",
      label: "Matte 150gsm",
      priceModifierMinor: 0,
      specBinding: { fieldCode: "material", valueCode: "matte_150gsm" },
      sortOrder: 0,
    },
  ],
};

const ADDON: CatalogOptionGroup = {
  id: "g_addon",
  name: "Add-ons",
  kind: "addon",
  helpText: null,
  required: false,
  selectionMode: "single",
  sortOrder: 2,
  version: 1,
  options: [
    {
      id: "o_lam",
      label: "Lamination",
      priceModifierMinor: 2000,
      specBinding: { fieldCode: "finish", valueCode: "lamination" },
      sortOrder: 0,
    },
  ],
};

const FLYERS: CatalogItem = {
  id: "sci_flyers",
  supplierId: "user_shop",
  supplierServiceId: "svc",
  categoryCode: "marketing_collateral",
  subcategoryCode: "flyers",
  name: "Flyers",
  description: null,
  basePriceMinor: 2500,
  fromPriceMinor: 2500,
  effectivePriceMinor: null,
  pricingUnit: "per_package",
  packageQty: 100,
  measurementKind: "none",
  measureUnit: null,
  minimumWidthMilli: null,
  minimumHeightMilli: null,
  minimumLengthMilli: null,
  minimumOrderQuantity: null,
  priceTiers: [],
  speedTiers: [],
  pricingBasis: "per_unit",
  turnaroundMode: "override",
  turnaroundHours: 48,
  rush: null,
  acceptedFormats: [],
  photos: [],
  prepSteps: [],
  optionGroups: [SIZE, PAPER, ADDON],
  version: 1,
  serviceVersion: 1,
};

function input(overrides: Partial<ListingSheetInput> = {}): ListingSheetInput {
  return {
    item: FLYERS,
    selection: {},
    layout: null,
    measured: { ...EMPTY_MEASUREMENT },
    quantity: 1,
    note: "",
    offeredLayouts: [],
    tooWide: null,
    ...overrides,
  };
}

describe("listingProblems", () => {
  it("names each unanswered required step, size first", () => {
    const problems = listingProblems(input());
    expect(problems.map((problem) => problem.key)).toEqual(["group:g_size", "group:g_paper"]);
    expect(problems[0]?.message).toBe("Pick a size first.");
    expect(listingProblemMessage(problems, "group:g_paper")).toBe("Pick a paper first.");
  });

  it("is empty once every required step is answered", () => {
    expect(
      listingProblems(input({ selection: { g_size: "o_a5", g_paper: "o_matte" } })),
    ).toEqual([]);
  });

  it("does not ask for an optional add-on", () => {
    const problems = listingProblems(
      input({ selection: { g_size: "o_a5", g_paper: "o_matte" } }),
    );
    expect(listingProblemMessage(problems, "group:g_addon")).toBeNull();
  });

  it("asks again when a selected add-on has disappeared", () => {
    expect(
      firstListingProblem(
        input({ selection: { g_size: "o_a5", g_paper: "o_matte", g_addon: "removed" } }),
      ),
    ).toEqual({ key: "group:g_addon", message: "Pick a add-ons first." });
  });

  it("asks for a layout after the specs, only where the shop offers one", () => {
    const problems = listingProblems(
      input({
        selection: { g_size: "o_a5", g_paper: "o_matte" },
        offeredLayouts: ["fit_to_paper", "actual_size_centered"],
      }),
    );
    expect(problems).toEqual([{ key: "layout", message: "Pick a layout first." }]);
    expect(
      listingProblems(
        input({
          selection: { g_size: "o_a5", g_paper: "o_matte" },
          offeredLayouts: ["fit_to_paper"],
          layout: "fit_to_paper",
        }),
      ),
    ).toEqual([]);
  });

  it("asks for width and height on a measured listing", () => {
    const tarp: CatalogItem = {
      ...FLYERS,
      pricingUnit: "per_area",
      measurementKind: "area",
      measureUnit: "ft",
      optionGroups: [],
    };
    const problems = listingProblems(input({ item: tarp }));
    expect(problems.map((problem) => problem.key)).toEqual(["measure:width", "measure:height"]);
    expect(problems[0]?.message).toBe("Enter how wide it is.");
    expect(
      listingProblemMessage(
        listingProblems(input({ item: tarp, measured: { ...EMPTY_MEASUREMENT, width: "0", height: "4" } })),
        "measure:width",
      ),
    ).toBe("Enter a width greater than zero.");
  });

  it("asks for length on a running-foot listing", () => {
    const roll: CatalogItem = {
      ...FLYERS,
      pricingUnit: "per_length",
      measurementKind: "length",
      measureUnit: "ft",
      optionGroups: [],
    };
    expect(firstListingProblem(input({ item: roll }))).toEqual({
      key: "measure:length",
      message: "Enter how long it is.",
    });
  });

  it("marks a job that is wider than the printer on the width field", () => {
    const tarp: CatalogItem = {
      ...FLYERS,
      pricingUnit: "per_area",
      measurementKind: "area",
      measureUnit: "ft",
      optionGroups: [],
    };
    expect(
      listingProblemMessage(
        listingProblems(
          input({
            item: tarp,
            measured: { ...EMPTY_MEASUREMENT, width: "8", height: "4" },
            tooWide: { short: "Too wide for this printer. Make it 7 ft wide or less first." },
          }),
        ),
        "measure:width",
      ),
    ).toBe("Too wide for this printer. Make it 7 ft wide or less first.");
  });

  it("marks a too-wide picked size on the size group", () => {
    expect(
      listingProblemMessage(
        listingProblems(
          input({
            selection: { g_size: "o_a5", g_paper: "o_matte" },
            tooWide: { short: "Too wide for this printer. Make it 7 ft wide or less first." },
          }),
        ),
        "group:g_size",
      ),
    ).toBe("Too wide for this printer. Make it 7 ft wide or less first.");
  });

  it("says when the quantity is under the shop's minimum", () => {
    const lanyard: CatalogItem = { ...FLYERS, optionGroups: [], minimumOrderQuantity: 10 };
    expect(firstListingProblem(input({ item: lanyard, quantity: 1 }))).toEqual({
      key: "quantity",
      message: "This shop takes orders of 10 and up. Change the quantity first.",
    });
    expect(listingProblems(input({ item: lanyard, quantity: 10 }))).toEqual([]);
  });

  it("keeps a note that is too long on the note field", () => {
    const note = "x".repeat(SPECIAL_INSTRUCTIONS_MAX + 4);
    const problem = firstListingProblem(
      input({ selection: { g_size: "o_a5", g_paper: "o_matte" }, note }),
    );
    expect(problem?.key).toBe("note");
    expect(problem?.message).toMatch(/300 characters/);
  });
});

describe("listingProblemScrollY", () => {
  it("leaves a gap above the field and never goes negative", () => {
    expect(listingProblemScrollY(80)).toBe(68);
    expect(listingProblemScrollY(8)).toBe(0);
    expect(listingProblemScrollY(0)).toBe(0);
  });
});
