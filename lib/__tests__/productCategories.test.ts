import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import {
  adaptProductCategories,
  findCategory,
  isSeededTree,
  productsForSubcategory,
  searchSubcategories,
  splitByAvailability,
  type ProductCategory,
} from "@/lib/productCategories";

const CATALOG = [
  { id: "prod_tarpaulin", family: "banner" },
  { id: "prod_sticker", family: "sticker" },
  { id: "prod_flyer", family: "flyer" },
  { id: "prod_card", family: "card" },
  { id: "prod_apparel", family: "apparel" },
];

describe("adaptProductCategories", () => {
  it("falls back to the seed when the payload carries no tree", () => {
    expect(isSeededTree(adaptProductCategories(undefined))).toBe(true);
    expect(isSeededTree(adaptProductCategories(null))).toBe(true);
    expect(isSeededTree(adaptProductCategories({}))).toBe(true);
  });

  it("ignores the production categories, which have no subcategory level", () => {
    const productionTaxonomy = {
      categories: [
        { id: "taxc_large_format", code: "large_format", name: "Large format", active: true },
        { id: "taxc_offset", code: "offset", name: "Offset / digital sheet", active: true },
      ],
      materials: [],
      finishes: [],
    };
    expect(isSeededTree(adaptProductCategories(productionTaxonomy))).toBe(true);
  });

  it("reads a published tree under productCategories", () => {
    const adapted = adaptProductCategories({
      productCategories: [
        {
          code: "merch",
          name: "Corporate & event merchandise",
          bestFor: "Student orgs, HR teams.",
          subcategories: [
            {
              code: "apparel",
              name: "Custom apparel",
              examples: "T-shirts, hoodies",
              productFamilyIds: ["apparel"],
            },
          ],
        },
      ],
    });

    expect(isSeededTree(adapted)).toBe(false);
    expect(adapted).toEqual([
      {
        code: "merch",
        name: "Corporate & event merchandise",
        bestFor: "Student orgs, HR teams.",
        subcategories: [
          {
            code: "apparel",
            name: "Custom apparel",
            examples: "T-shirts, hoodies",
            productFamilyIds: ["apparel"],
          },
        ],
      },
    ]);
  });

  it("accepts the field-name aliases the contract may land on", () => {
    const adapted = adaptProductCategories({
      categories: [
        {
          slug: "merch",
          title: "Merchandise",
          audience: "HR teams.",
          children: [
            {
              slug: "apparel",
              title: "Custom apparel",
              exampleText: "Tote bags",
              families: ["apparel"],
            },
          ],
        },
      ],
    });

    expect(adapted[0].code).toBe("merch");
    expect(adapted[0].bestFor).toBe("HR teams.");
    expect(adapted[0].subcategories[0].examples).toBe("Tote bags");
    expect(adapted[0].subcategories[0].productFamilyIds).toEqual(["apparel"]);
  });

  it("drops inactive categories and inactive subcategories", () => {
    const adapted = adaptProductCategories({
      productCategories: [
        {
          code: "gone",
          name: "Retired",
          active: false,
          subcategories: [{ code: "a", name: "A" }],
        },
        {
          code: "live",
          name: "Live",
          subcategories: [
            { code: "a", name: "A", active: false },
            { code: "b", name: "B" },
          ],
        },
      ],
    });

    expect(adapted.map((c) => c.code)).toEqual(["live"]);
    expect(adapted[0].subcategories.map((s) => s.code)).toEqual(["b"]);
  });

  it("skips entries missing a code or a name rather than rendering a blank row", () => {
    const adapted = adaptProductCategories({
      productCategories: [
        {
          code: "live",
          name: "Live",
          subcategories: [{ name: "No code" }, { code: "no-name" }, { code: "b", name: "B" }],
        },
      ],
    });

    expect(adapted[0].subcategories.map((s) => s.code)).toEqual(["b"]);
  });

  it("tolerates a subcategory with no examples and no families", () => {
    const adapted = adaptProductCategories({
      productCategories: [{ code: "c", name: "C", subcategories: [{ code: "s", name: "S" }] }],
    });

    expect(adapted[0].subcategories[0]).toEqual({
      code: "s",
      name: "S",
      examples: "",
      productFamilyIds: [],
    });
  });

  it("reads the live GET /taxonomy document from categoryTree", () => {
    const adapted = adaptProductCategories({
      taxonomy: {
        categories: [
          { code: "corporate_event_merch", name: "Corporate & Event Merchandise", active: true },
        ],
        subcategories: [],
      },
      categoryTree: [
        {
          code: "corporate_event_merch",
          name: "Corporate & Event Merchandise",
          bestFor: "Student orgs, HR teams.",
          subcategories: [
            {
              code: "custom_apparel",
              name: "Custom Apparel",
              examples: ["T-shirts", "Hoodies"],
            },
          ],
        },
      ],
    });

    expect(isSeededTree(adapted)).toBe(false);
    expect(adapted[0].code).toBe("corporate_event_merch");
    expect(adapted[0].subcategories[0].examples).toBe("T-shirts, Hoodies");
  });

  it("joins a flat taxonomy when the nested tree is missing", () => {
    const adapted = adaptProductCategories({
      taxonomy: {
        categories: [
          { code: "marketing_collateral", name: "Marketing", bestFor: "Shops.", active: true },
        ],
        subcategories: [
          {
            code: "flyers",
            name: "Flyers",
            categoryCode: "marketing_collateral",
            examples: ["Single sheets"],
            active: true,
          },
        ],
      },
    });

    expect(adapted[0].code).toBe("marketing_collateral");
    expect(adapted[0].subcategories.map((s) => s.code)).toEqual(["flyers"]);
    expect(adapted[0].subcategories[0].examples).toBe("Single sheets");
  });
});

describe("the bundled seed", () => {
  it("carries the captain's five categories and twenty-two subcategories", () => {
    expect(PRODUCT_CATEGORY_SEED).toHaveLength(5);
    const total = PRODUCT_CATEGORY_SEED.reduce((n, c) => n + c.subcategories.length, 0);
    expect(total).toBe(22);
  });

  it("has a home for everyday paperwork, which the first four did not", () => {
    // A thesis, a hundred handouts and a set of ID photographs are not
    // marketing, merchandise, an award or a prototype, and the largest price
    // list in the master catalogue is exactly that work.
    const documents = PRODUCT_CATEGORY_SEED.find((c) => c.code === "document_publication");
    expect(documents).toBeTruthy();
    expect(documents!.subcategories.map((s) => s.code)).toEqual([
      "document_printing",
      "booklets",
      "risograph",
      "binding_hardbound",
      "id_photos",
    ]);
  });

  it("matches the platform's own category codes exactly", () => {
    // A code the platform does not know is a 400 on the shop list, which the
    // category screen can only report as "prices not loaded". The seed and
    // the taxonomy have to agree or browsing breaks on that category alone.
    expect(PRODUCT_CATEGORY_SEED.map((c) => c.code)).toEqual([
      "marketing_collateral",
      "corporate_event_merch",
      "recognition_awards_signage",
      "specialized_prototyping",
      "document_publication",
    ]);
  });

  it("gives every category an audience line and every subcategory examples", () => {
    for (const category of PRODUCT_CATEGORY_SEED) {
      expect(category.bestFor.length).toBeGreaterThan(0);
      for (const subcategory of category.subcategories) {
        expect(subcategory.examples.length).toBeGreaterThan(0);
      }
    }
  });

  it("maps only onto families the catalog actually prices", () => {
    const families = new Set(CATALOG.map((p) => p.family));
    for (const category of PRODUCT_CATEGORY_SEED) {
      for (const subcategory of category.subcategories) {
        for (const family of subcategory.productFamilyIds) {
          expect(families.has(family)).toBe(true);
        }
      }
    }
  });
});

describe("productsForSubcategory", () => {
  const seed = PRODUCT_CATEGORY_SEED;

  it("resolves a mapped subcategory to its catalog product", () => {
    const flyers = seed[0].subcategories.find((s) => s.code === "flyers")!;
    expect(productsForSubcategory(flyers, CATALOG).map((p) => p.id)).toEqual(["prod_flyer"]);
  });

  it("resolves an unmapped subcategory to nothing, rather than the first product", () => {
    const drinkware = seed[1].subcategories.find((s) => s.code === "drinkware")!;
    expect(productsForSubcategory(drinkware, CATALOG)).toEqual([]);
  });

  it("resolves nothing when the catalog has not loaded", () => {
    const flyers = seed[0].subcategories.find((s) => s.code === "flyers")!;
    expect(productsForSubcategory(flyers, [])).toEqual([]);
  });
});

describe("splitByAvailability", () => {
  it("separates what the app prices from what Operations quotes", () => {
    const merch = PRODUCT_CATEGORY_SEED[1];
    const split = splitByAvailability(merch.subcategories, CATALOG);

    expect(split.orderable.map((s) => s.code)).toEqual(["custom_apparel"]);
    expect(split.quotedByOperations.map((s) => s.code)).toEqual([
      "lanyards_id_accessories",
      "drinkware",
      "corporate_giveaways",
    ]);
  });

  it("puts everything in the quoted group while the catalog is still loading", () => {
    const marketing = PRODUCT_CATEGORY_SEED[0];
    const split = splitByAvailability(marketing.subcategories, []);
    expect(split.orderable).toEqual([]);
    expect(split.quotedByOperations).toHaveLength(6);
  });
});

describe("searchSubcategories", () => {
  const seed = PRODUCT_CATEGORY_SEED;

  it("ignores a query too short to mean anything", () => {
    expect(searchSubcategories(seed, "")).toEqual([]);
    expect(searchSubcategories(seed, "t")).toEqual([]);
  });

  it("finds a subcategory by name", () => {
    const hits = searchSubcategories(seed, "flyers");
    expect(hits[0].subcategory.code).toBe("flyers");
    expect(hits[0].category.code).toBe("marketing_collateral");
  });

  it("finds a subcategory by an example nobody would guess the name of", () => {
    expect(searchSubcategories(seed, "tote bag")[0].subcategory.code).toBe("custom_apparel");
    expect(searchSubcategories(seed, "x-stand")[0].subcategory.code).toBe("posters_standees");
    expect(searchSubcategories(seed, "panaflex")[0].subcategory.code).toBe(
      "business_store_signages",
    );
  });

  it("ranks a name match above an example match", () => {
    const hits = searchSubcategories(seed, "sticker");
    expect(hits[0].subcategory.code).toBe("stickers_packaging_labels");
  });

  it("matches the audience line, so a client who names themselves finds the category", () => {
    const hits = searchSubcategories(seed, "student org");
    expect(hits.map((h) => h.category.code)).toEqual(
      Array(4).fill("corporate_event_merch"),
    );
  });

  it("is case- and punctuation-insensitive", () => {
    expect(searchSubcategories(seed, "T-SHIRTS")[0].subcategory.code).toBe("custom_apparel");
    expect(searchSubcategories(seed, "business cards")[0].subcategory.code).toBe(
      "business_cards",
    );
  });

  it("returns nothing for a query the catalogue does not cover", () => {
    expect(searchSubcategories(seed, "zzzznotathing")).toEqual([]);
  });
});

describe("findCategory", () => {
  const seed: ProductCategory[] = PRODUCT_CATEGORY_SEED;

  it("finds a category by code", () => {
    expect(findCategory(seed, "corporate_event_merch")?.name).toBe(
      "Corporate & event merchandise",
    );
    // Stale Client seed code still finds the live category.
    expect(findCategory(seed, "event_merchandise")?.code).toBe("corporate_event_merch");
  });

  it("returns null for an unknown or missing code", () => {
    expect(findCategory(seed, "nope")).toBeNull();
    expect(findCategory(seed, undefined)).toBeNull();
  });
});
