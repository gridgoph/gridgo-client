import type { CatalogItem, CatalogOptionGroup } from "@/lib/api";
import {
  acceptedExtensions,
  addOnGroups,
  boundValue,
  fileMatchesFormats,
  firstMissingGroup,
  formatSentence,
  isSelectionComplete,
  linkFormats,
  pickerMimeTypes,
  productionDays,
  quantityLine,
  samplePhotoUri,
  selectedOptionIds,
  specGroups,
  trimRatio,
  clientLineTotalMinor,
  clientStartingPriceLine,
  clientUnitPriceMinor,
  startingPriceLine,
  unitLine,
  unitPriceMinor,
} from "@/lib/listing";

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
    {
      id: "o_a4",
      label: "A4",
      priceModifierMinor: 1500,
      specBinding: { fieldCode: "size", value: "A4" },
      sortOrder: 1,
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
  measurementKind: "none" as const,
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
  acceptedFormats: [
    {
      code: "jpeg",
      displayName: "JPEG",
      inputKind: "file",
      extensions: ["jpg", "jpeg"],
      mimeTypes: ["image/jpeg"],
      active: true,
    },
    {
      code: "pdf",
      displayName: "PDF",
      inputKind: "file",
      extensions: ["pdf"],
      mimeTypes: ["application/pdf"],
      active: true,
    },
    {
      code: "canva_link",
      displayName: "Canva link",
      inputKind: "url",
      extensions: [],
      mimeTypes: [],
      active: true,
    },
  ],
  photos: [],
  prepSteps: [],
  optionGroups: [SIZE, PAPER, ADDON],
  version: 1,
  serviceVersion: 1,
};

describe("groups", () => {
  it("keeps the steps and the extras apart, in the shop's own order", () => {
    expect(specGroups(FLYERS).map((group) => group.name)).toEqual(["Size", "Paper"]);
    expect(addOnGroups(FLYERS).map((group) => group.name)).toEqual(["Add-ons"]);
  });

  it("is not complete until every required step is answered", () => {
    expect(isSelectionComplete(FLYERS, {})).toBe(false);
    expect(isSelectionComplete(FLYERS, { g_size: "o_a5" })).toBe(false);
    expect(isSelectionComplete(FLYERS, { g_size: "o_a5", g_paper: "o_matte" })).toBe(true);
  });

  it("names the first step still unanswered, so the sheet can point at it", () => {
    expect(firstMissingGroup(FLYERS, {})?.name).toBe("Size");
    expect(firstMissingGroup(FLYERS, { g_size: "o_a5" })?.name).toBe("Paper");
    expect(firstMissingGroup(FLYERS, { g_size: "o_a5", g_paper: "o_matte" })).toBeNull();
  });

  it("does not need an add-on to be complete", () => {
    expect(isSelectionComplete(FLYERS, { g_size: "o_a4", g_paper: "o_matte" })).toBe(true);
  });
});

describe("unitPriceMinor", () => {
  it("is the shop's base plus every modifier it published", () => {
    expect(unitPriceMinor(FLYERS, { g_size: "o_a4", g_paper: "o_matte" })).toBe(4000);
    expect(
      unitPriceMinor(FLYERS, { g_size: "o_a4", g_paper: "o_matte", g_addon: "o_lam" }),
    ).toBe(6000);
  });

  it("never goes below zero, the same as the server", () => {
    const discounted: CatalogItem = {
      ...FLYERS,
      basePriceMinor: 500,
      optionGroups: [
        {
          ...SIZE,
          options: [{ ...SIZE.options[0], priceModifierMinor: -900 }],
        },
      ],
    };
    expect(unitPriceMinor(discounted, { g_size: "o_a5" })).toBe(0);
  });

  it("marks the shop unit up to the GRIDGO price the client is shown", () => {
    const tarp: CatalogItem = {
      ...FLYERS,
      basePriceMinor: 1_200,
      fromPriceMinor: 1_200,
      pricingUnit: "per_area",
      measureUnit: "ft",
      optionGroups: [],
    };
    expect(unitPriceMinor(tarp, {})).toBe(1_200);
    expect(clientUnitPriceMinor(tarp, {}, 4_500)).toBe(1_740);
    expect(clientUnitPriceMinor(tarp, {}, 1_000)).toBe(1_320);
  });

  it("marks the listing total up after the shop line is priced", () => {
    const tarp: CatalogItem = {
      ...FLYERS,
      basePriceMinor: 1_200,
      fromPriceMinor: 1_200,
      pricingUnit: "per_area",
      measureUnit: "ft",
      measurementKind: "area",
      optionGroups: [],
    };
    // One square foot at ₱12.00. The sticky total is the GRIDGO line, not shop.
    expect(clientLineTotalMinor(tarp, 1, { width: 1_000, height: 1_000 }, 1_200, 4_500)).toBe(1_740);
    expect(clientLineTotalMinor(tarp, 1, { width: 1_000, height: 1_000 }, 1_200, 1_000)).toBe(1_320);
    expect(clientLineTotalMinor(tarp, 1, null, 1_200, 4_500)).toBeNull();
  });
});

describe("what a quantity means", () => {
  it("turns packs into pieces, because that is what the client is buying", () => {
    expect(unitLine(FLYERS)).toBe("per pack of 100");
    expect(quantityLine(FLYERS, 1)).toBe("1 pack · 100 pieces");
    expect(quantityLine(FLYERS, 3)).toBe("3 packs · 300 pieces");
  });

  it("leaves a per-unit listing counted in pieces", () => {
    const perUnit: CatalogItem = { ...FLYERS, pricingUnit: "per_unit", packageQty: null };
    expect(unitLine(perUnit)).toBe("each");
    expect(quantityLine(perUnit, 1)).toBe("1 piece");
    expect(quantityLine(perUnit, 5)).toBe("5 pieces");
  });

  it("names every pricing unit the API stores, in the client's words", () => {
    expect(unitLine({ ...FLYERS, pricingUnit: "per_page" })).toBe("per page");
    expect(unitLine({ ...FLYERS, pricingUnit: "per_area", measureUnit: "ft" })).toBe("per sq ft");
    expect(unitLine({ ...FLYERS, pricingUnit: "per_length", measureUnit: "in" })).toBe(
      "per inch",
    );
    expect(unitLine({ ...FLYERS, pricingUnit: "per_length", measureUnit: "m" })).toBe(
      "per metre",
    );
    expect(unitLine({ ...FLYERS, pricingUnit: "whole_job" })).toBe("for the job");
  });

  it("puts the unit on the category starting price, at GRIDGO's price", () => {
    // The shop's ₱25.00 plus GRIDGO's 10%; the shop's own figure is never the line.
    expect(startingPriceLine(FLYERS, 1000)).toBe("From ₱27.50 per pack of 100");
    expect(
      startingPriceLine(
        {
          ...FLYERS,
          fromPriceMinor: 4000,
          pricingUnit: "per_area",
          measureUnit: "ft",
        },
        1000,
      ),
    ).toBe("From ₱44.00 per sq ft");
  });

  it("marks the starting price up to the GRIDGO figure the client is shown", () => {
    const tarp = {
      ...FLYERS,
      fromPriceMinor: 1_200,
      pricingUnit: "per_area" as const,
      measureUnit: "ft" as const,
    };
    expect(clientStartingPriceLine(tarp, 4_500)).toBe("From ₱17.40 per sq ft");
    expect(clientStartingPriceLine(tarp, 1_000)).toBe("From ₱13.20 per sq ft");
    expect(clientStartingPriceLine({ ...tarp, clientFromPriceMinor: 1_740 })).toBe(
      "From ₱17.40 per sq ft",
    );
  });
});

describe("productionDays", () => {
  it("prefers GRIDGO's days and keeps a range only when it is one", () => {
    expect(productionDays({ turnaroundDays: 2, minimumTurnaroundDays: 1, turnaroundHours: 20 })).toEqual({
      min: 1,
      max: 2,
    });
    expect(productionDays({ turnaroundDays: 2, minimumTurnaroundDays: 2, turnaroundHours: 20 })).toEqual({
      min: null,
      max: 2,
    });
  });

  it("says nothing when the shop stated nothing", () => {
    expect(productionDays({ turnaroundHours: null })).toBeNull();
    expect(productionDays({ turnaroundHours: 0 })).toBeNull();
  });
});

describe("artwork formats", () => {
  it("offers the picker only what this listing takes", () => {
    expect(pickerMimeTypes(FLYERS).sort()).toEqual(["application/pdf", "image/jpeg"]);
    expect(acceptedExtensions(FLYERS).sort()).toEqual(["jpeg", "jpg", "pdf"]);
  });

  it("keeps links out of the upload set and names them separately", () => {
    expect(linkFormats(FLYERS).map((format) => format.code)).toEqual(["canva_link"]);
    expect(formatSentence(linkFormats(FLYERS))).toBe("Canva link");
  });

  it("reads a file by its extension first, because that is what a client can fix", () => {
    expect(fileMatchesFormats(FLYERS, "poster.JPG", null)).toBe(true);
    expect(fileMatchesFormats(FLYERS, "poster.pdf", "application/octet-stream")).toBe(true);
    expect(fileMatchesFormats(FLYERS, "poster.psd", "image/vnd.adobe.photoshop")).toBe(false);
  });

  it("falls back to the picker's type when the name carries none", () => {
    // iOS reports unreliable types, so a matching name is trusted over a type
    // that does not — but a type is better than nothing at all.
    expect(fileMatchesFormats(FLYERS, "IMG_0042", "image/jpeg")).toBe(true);
    expect(fileMatchesFormats(FLYERS, "IMG_0042", "image/heic")).toBe(false);
  });

  it("joins format names the way a sentence does", () => {
    expect(formatSentence([])).toBe("");
    expect(formatSentence(FLYERS.acceptedFormats.slice(0, 1))).toBe("JPEG");
    expect(formatSentence(FLYERS.acceptedFormats)).toBe("JPEG, PDF or Canva link");
  });
});

describe("spec bindings", () => {
  it("carries the shop's bound values onto the order", () => {
    const selection = { g_size: "o_a4", g_paper: "o_matte", g_addon: "o_lam" };
    expect(boundValue(FLYERS, selection, "size")).toBe("A4");
    expect(boundValue(FLYERS, selection, "material")).toBe("matte_150gsm");
    expect(boundValue(FLYERS, selection, "finish")).toBe("lamination");
    expect(boundValue(FLYERS, selection, "colour")).toBe("");
  });

});

describe("trimRatio", () => {
  it("knows the sizes GRIDGO names", () => {
    expect(trimRatio("A4")).toBeCloseTo(210 / 297, 4);
    expect(trimRatio("a5")).toBeCloseTo(148 / 210, 4);
  });

  it("reads a written size, units and all, because they cancel", () => {
    expect(trimRatio("3ft x 5ft")).toBeCloseTo(3 / 5, 4);
    expect(trimRatio("24 x 36 in")).toBeCloseTo(24 / 36, 4);
  });

  it("answers nothing for a size it cannot measure", () => {
    expect(trimRatio("Custom")).toBeNull();
    expect(trimRatio("")).toBeNull();
  });
});

describe("samplePhotoUri", () => {
  it("uses the signed downloadUrl when the match payload carries one", () => {
    expect(
      samplePhotoUri({
        fileId: "file_davao_quickprint_flyers",
        sortOrder: 0,
        altText: "Flyers",
        url: "/catalog/media/file_davao_quickprint_flyers",
        downloadUrl: "https://signed.example/flyers.jpg?sig=1",
      }),
    ).toBe("https://signed.example/flyers.jpg?sig=1");
  });

  it("does not treat the metadata /catalog/media url as image bytes", () => {
    // A listing with fileId but no signed link must not paint the relative
    // metadata path into <Image> — that is how match showed "No sample".
    expect(
      samplePhotoUri({
        fileId: "file_davao_quickprint_flyers",
        sortOrder: 0,
        altText: "Flyers",
        url: "/catalog/media/file_davao_quickprint_flyers",
      }),
    ).toBeNull();
  });

  it("returns null when there is no photo", () => {
    expect(samplePhotoUri(null)).toBeNull();
    expect(samplePhotoUri(undefined)).toBeNull();
  });
});

it("requires a new choice when a selected option disappears, preserving other choices", () => {
  const selection = { g_size: "o_a4", g_paper: "o_matte", g_addon: "o_lam" };
  const updated = {
    ...FLYERS,
    optionGroups: [{ ...SIZE, options: [SIZE.options[0]] }, PAPER, ADDON],
  };
  expect(isSelectionComplete(FLYERS, selection)).toBe(true);
  expect(isSelectionComplete(updated, selection)).toBe(false);
  expect(firstMissingGroup(updated, selection)?.id).toBe("g_size");
  expect(selectedOptionIds(updated, selection)).toEqual(["o_matte", "o_lam"]);
  expect(isSelectionComplete(updated, { ...selection, g_size: "o_a5" })).toBe(true);
});

it("rejects options from another group and removed add-ons", () => {
  const misplaced = { g_size: "o_matte", g_paper: "o_matte" };
  expect(isSelectionComplete(FLYERS, misplaced)).toBe(false);
  expect(selectedOptionIds(FLYERS, misplaced)).toEqual(["o_matte"]);
  const selection = { g_size: "o_a4", g_paper: "o_matte", g_addon: "removed" };
  expect(isSelectionComplete(FLYERS, selection)).toBe(false);
  expect(firstMissingGroup(FLYERS, selection)?.id).toBe("g_addon");
  expect(selectedOptionIds(FLYERS, selection)).toEqual(["o_a4", "o_matte"]);
  expect(unitPriceMinor(FLYERS, selection)).toBe(4000);
});
