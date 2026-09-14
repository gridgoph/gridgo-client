import type { CatalogItem, CatalogOptionGroup } from "@/lib/api";
import {
  acceptedExtensions,
  addOnGroups,
  artworkFitWarning,
  boundValue,
  fileMatchesFormats,
  firstMissingGroup,
  formatSentence,
  isSelectionComplete,
  linkFormats,
  pickerMimeTypes,
  quantityLine,
  readyInShort,
  samplePhotoUri,
  selectedOptionIds,
  specGroups,
  trimRatio,
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

  it("puts the unit on the category starting price", () => {
    expect(startingPriceLine(FLYERS)).toBe("From ₱25.00 per pack of 100");
    expect(
      startingPriceLine({
        ...FLYERS,
        fromPriceMinor: 4000,
        pricingUnit: "per_area",
        measureUnit: "ft",
      }),
    ).toBe("From ₱40.00 per sq ft");
  });
});

describe("readyInShort", () => {
  it("says hours under a day and rounded days above", () => {
    expect(readyInShort(6)).toBe("6 hours");
    expect(readyInShort(1)).toBe("1 hour");
    expect(readyInShort(24)).toBe("1 day");
    expect(readyInShort(48)).toBe("2 days");
    expect(readyInShort(30)).toBe("1 day");
  });

  it("says nothing when the shop stated nothing", () => {
    expect(readyInShort(null)).toBeNull();
    expect(readyInShort(0)).toBeNull();
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

describe("artworkFitWarning", () => {
  it("says nothing when the artwork is the shape of the sheet", () => {
    expect(artworkFitWarning("A5", { width: 1480, height: 2100 })).toBeNull();
  });

  it("allows for bleed rather than nagging about 3mm", () => {
    // A 3mm bleed on A5 moves the ratio by about 2%.
    expect(artworkFitWarning("A5", { width: 1540, height: 2160 })).toBeNull();
  });

  it("warns — and never blocks — on a shape that will be cropped", () => {
    const warning = artworkFitWarning("A5", { width: 1920, height: 1080 });
    expect(warning).not.toBeNull();
    expect(warning?.blocking).toBe(false);
    expect(warning?.message).toContain("cropped");
    expect(warning?.message).toContain("You can send it as it is");
  });

  it("does not nag about a design that is simply the other way up", () => {
    // "A4" says nothing about orientation and a shop rotates a file for free,
    // so a landscape A4 design on an A4 sheet is not a mismatch at all.
    expect(artworkFitWarning("A4", { width: 2970, height: 2100 })).toBeNull();
  });

  it("names the orientation when the proportions are wrong as well", () => {
    const warning = artworkFitWarning("A5", { width: 1920, height: 1080 });
    expect(warning?.message).toContain("Your file is landscape and the size is portrait");
  });

  it("stays quiet when it has not seen the artwork or cannot measure the size", () => {
    // A PDF never reports pixels, and GRIDGO has not looked inside it — so it
    // must not claim the file is the wrong shape.
    expect(artworkFitWarning("A5", null)).toBeNull();
    expect(artworkFitWarning("Custom", { width: 1920, height: 1080 })).toBeNull();
    expect(artworkFitWarning("A5", { width: 0, height: 0 })).toBeNull();
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
