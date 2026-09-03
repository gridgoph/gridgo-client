import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import { categoryExamples, categoryGlyph, categoryShortName } from "@/lib/categoryLook";
import type { ProductCategory } from "@/lib/productCategories";

function category(over: Partial<ProductCategory>): ProductCategory {
  return { code: "x", name: "X", bestFor: "", subcategories: [], ...over };
}

describe("the short label a start tile is set in", () => {
  it("shortens every governed category", () => {
    for (const entry of PRODUCT_CATEGORY_SEED) {
      expect(categoryShortName(entry).length).toBeLessThanOrEqual(16);
    }
  });

  it("reads the older client code the catalog renamed", () => {
    expect(categoryShortName(category({ code: "event_merchandise" }))).toBe("Merch & events");
  });

  it("keeps the catalogue name for a category it has never seen", () => {
    expect(categoryShortName(category({ code: "engraving", name: "Engraving" }))).toBe("Engraving");
  });
});

describe("the mark on the tile", () => {
  it("gives each governed category its own", () => {
    const marks = PRODUCT_CATEGORY_SEED.map(categoryGlyph);
    expect(new Set(marks).size).toBe(PRODUCT_CATEGORY_SEED.length);
  });

  it("falls back to a sheet rather than guessing", () => {
    expect(categoryGlyph(category({ code: "engraving" }))).toBe("sheet");
  });
});

describe("what is inside a category", () => {
  it("names two and sizes the rest", () => {
    expect(categoryExamples(PRODUCT_CATEGORY_SEED[0])).toBe("Flyers, Brochures and 4 more");
  });

  it("does not say 'and 0 more'", () => {
    const two = category({
      subcategories: [
        { code: "a", name: "Flyers", examples: "", productFamilyIds: [] },
        { code: "b", name: "Posters", examples: "", productFamilyIds: [] },
      ],
    });
    expect(categoryExamples(two)).toBe("Flyers and Posters");
    expect(categoryExamples(category({}))).toBe("");
  });
});
