import {
  categoriesForFamily,
  finishOptions,
  isKnownOption,
  materialOptions,
  type Taxonomy,
} from "@/lib/taxonomy";

/** Trimmed copy of what `GET /taxonomy` serves. */
const taxonomy: Taxonomy = {
  categories: [
    {
      id: "taxc_large_format",
      code: "large_format",
      name: "Large format",
      productFamilyIds: ["banner"],
      active: true,
    },
    {
      id: "taxc_offset",
      code: "offset",
      name: "Offset / digital sheet",
      productFamilyIds: ["flyer", "card", "sticker"],
      active: true,
    },
    {
      id: "taxc_retired",
      code: "retired",
      name: "Retired",
      productFamilyIds: ["banner"],
      active: false,
    },
  ],
  materials: [
    {
      id: "taxm_13oz",
      code: "tarpaulin_13oz",
      name: "13oz tarpaulin",
      categoryCodes: ["large_format", "signage"],
      active: true,
    },
    {
      id: "taxm_matte150",
      code: "matte_150gsm",
      name: "Matte 150gsm",
      categoryCodes: ["offset"],
      active: true,
    },
    {
      id: "taxm_gone",
      code: "discontinued",
      name: "Discontinued stock",
      categoryCodes: ["offset"],
      active: false,
    },
  ],
  finishes: [
    {
      id: "taxf_laminate",
      code: "lamination",
      name: "Lamination",
      categoryCodes: ["offset"],
      active: true,
    },
  ],
};

describe("categoriesForFamily", () => {
  it("selects the categories that cover a catalog family", () => {
    expect(categoriesForFamily(taxonomy, "banner").map((c) => c.code)).toEqual(["large_format"]);
  });

  it("ignores retired categories", () => {
    expect(categoriesForFamily(taxonomy, "banner").map((c) => c.code)).not.toContain("retired");
  });

  it("offers everything active rather than nothing for an unknown family", () => {
    expect(categoriesForFamily(taxonomy, "hologram").length).toBe(2);
  });
});

describe("materialOptions", () => {
  it("only offers materials the family can actually be printed on", () => {
    expect(materialOptions(taxonomy, "banner").map((o) => o.value)).toEqual(["13oz tarpaulin"]);
    expect(materialOptions(taxonomy, "flyer").map((o) => o.value)).toEqual(["Matte 150gsm"]);
  });

  it("leaves discontinued stock out of the picker", () => {
    expect(materialOptions(taxonomy, "flyer").map((o) => o.value)).not.toContain(
      "Discontinued stock",
    );
  });

  it("names the category as the hint, never a code", () => {
    const [option] = materialOptions(taxonomy, "flyer");
    expect(option.hint).toBe("Offset / digital sheet");
    expect(option.hint).not.toMatch(/_/);
  });
});

describe("finishOptions", () => {
  it("filters finishes by the same categories", () => {
    expect(finishOptions(taxonomy, "flyer").map((o) => o.value)).toEqual(["Lamination"]);
    expect(finishOptions(taxonomy, "banner")).toEqual([]);
  });
});

describe("isKnownOption", () => {
  it("recognises a value the platform still offers", () => {
    const options = materialOptions(taxonomy, "flyer");
    expect(isKnownOption(options, "Matte 150gsm")).toBe(true);
    expect(isKnownOption(options, "13oz tarpaulin")).toBe(false);
    expect(isKnownOption(options, "  ")).toBe(false);
  });
});
