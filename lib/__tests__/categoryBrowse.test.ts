import type { CatalogItem } from "@/lib/api";
import { isHunting, subcategoryMatchesHunt } from "@/lib/categoryBrowse";
import type { ProductSubcategory } from "@/lib/productCategories";

const APPAREL: ProductSubcategory = {
  code: "custom_apparel",
  name: "Custom apparel",
  examples: "T-shirts, hoodies, polo shirts, tote bags",
  productFamilyIds: ["apparel"],
};

const LISTING = {
  name: "Jopal tees",
  description: "Cotton tees",
} as CatalogItem;

describe("isHunting", () => {
  it("ignores a query too short to mean anything", () => {
    expect(isHunting("")).toBe(false);
    expect(isHunting("t")).toBe(false);
    expect(isHunting("te")).toBe(true);
  });
});

describe("subcategoryMatchesHunt", () => {
  it("lets every sample through until the hunt means something", () => {
    expect(subcategoryMatchesHunt(APPAREL, LISTING, "")).toBe(true);
    expect(subcategoryMatchesHunt(APPAREL, LISTING, "t")).toBe(true);
  });

  it("matches the thing's name, its examples, and the sample's own name", () => {
    expect(subcategoryMatchesHunt(APPAREL, LISTING, "hoodie")).toBe(true);
    expect(subcategoryMatchesHunt(APPAREL, LISTING, "tote bag")).toBe(true);
    expect(subcategoryMatchesHunt(APPAREL, LISTING, "jopal")).toBe(true);
    expect(subcategoryMatchesHunt(APPAREL, LISTING, "tarpaulin")).toBe(false);
  });
});
