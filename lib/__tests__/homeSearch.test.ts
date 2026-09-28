import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import {
  HOME_SEARCH_LIMIT,
  homeSearch,
  homeSearchAnnouncement,
  matchedExample,
  splitMatch,
} from "@/lib/homeSearch";
import { searchSubcategories } from "@/lib/productCategories";

const tree = PRODUCT_CATEGORY_SEED;

describe("homeSearch", () => {
  it("finds Flyers for “flyer”, first, captioned with its family", () => {
    const search = homeSearch(tree, "flyer");
    expect(search.searching).toBe(true);
    expect(search.rows[0].subcategory.name).toBe("Flyers");
    expect(search.rows[0].caption).toBe("Marketing");
  });

  it("reads the picker's own search rather than a second index", () => {
    for (const query of ["flyer", "tote", "sign", "mug", "banner"]) {
      const expected = searchSubcategories(tree, query);
      const search = homeSearch(tree, query);
      expect(search.total).toBe(expected.length);
      expect(search.rows.map((row) => row.subcategory.code)).toEqual(
        expected.slice(0, HOME_SEARCH_LIMIT).map((hit) => hit.subcategory.code),
      );
    }
  });

  it("names the example a row matched through", () => {
    const search = homeSearch(tree, "tote");
    const apparel = search.rows.find((row) => row.subcategory.code === "custom_apparel");
    expect(apparel?.caption).toBe("Includes tote bags");
  });

  it("stays closed below two characters, and ignores surrounding space", () => {
    expect(homeSearch(tree, "f").searching).toBe(false);
    expect(homeSearch(tree, "  f ").rows).toEqual([]);
    expect(homeSearch(tree, "  flyer ").rows[0].subcategory.name).toBe("Flyers");
  });

  it("caps the rows but keeps the whole count for “See all”", () => {
    // Matching the family's own words lists every one of its subcategories.
    const search = homeSearch(tree, "marketing");
    expect(search.total).toBeGreaterThan(HOME_SEARCH_LIMIT);
    expect(search.rows).toHaveLength(HOME_SEARCH_LIMIT);
  });

  it("returns no rows, still searching, when nothing matches", () => {
    const search = homeSearch(tree, "zzqx");
    expect(search).toEqual({ searching: true, rows: [], total: 0 });
  });
});

describe("matchedExample", () => {
  it("returns the example as written", () => {
    const drinkware = tree
      .flatMap((category) => category.subcategories)
      .find((subcategory) => subcategory.code === "drinkware")!;
    expect(matchedExample(drinkware, "tumbler")).toBe("laser-engraved tumblers");
    expect(matchedExample(drinkware, "poster")).toBeNull();
  });
});

describe("splitMatch", () => {
  it("splits around the typed part, whatever its case", () => {
    expect(splitMatch("Business cards", "CARD")).toEqual({
      before: "Business ",
      match: "card",
      after: "s",
    });
  });

  it("returns nothing to embolden when the text does not contain it as typed", () => {
    expect(splitMatch("x-stands", "x stand")).toBeNull();
    expect(splitMatch("Flyers", "  ")).toBeNull();
  });
});

describe("homeSearchAnnouncement", () => {
  it("says the count, and that the list is cut", () => {
    expect(homeSearchAnnouncement(homeSearch(tree, "zzqx"), "zzqx")).toBe("No matches for zzqx");
    const capped = homeSearch(tree, "marketing");
    expect(homeSearchAnnouncement(capped, "marketing")).toBe(
      `${capped.total} matches for marketing, showing ${HOME_SEARCH_LIMIT}`,
    );
  });
});
