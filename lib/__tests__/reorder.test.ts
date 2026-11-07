import type { CatalogItem, CatalogProduct, Order } from "@/lib/api";
import {
  reorderAnswers,
  reorderApplies,
  reorderArtworkFileIds,
  reorderArtworkNote,
  reorderFulfilment,
  reorderSheet,
  reorderTarget,
} from "@/lib/reorder";
import { CURRENT_FLOW_ORDER, OLD_SHAPE_ORDER, REORDER_CATALOG, REORDER_TREE } from "@/test/reorderFixtures";

function group(id: string, name: string, labels: string[]) {
  return { id, name, options: labels.map((label) => ({ id: `${id}:${label}`, label })) };
}

function listing(overrides: Partial<CatalogItem> = {}) {
  return {
    subcategoryCode: "flyers",
    pricingUnit: "per_package",
    packageQty: 100,
    measureUnit: null,
    optionGroups: [group("paper", "Paper", ["Gloss", "Matte"]), group("size", "Size", ["A5"])],
    ...overrides,
  } as unknown as CatalogItem;
}

function withItem(fields: Record<string, unknown>): Order {
  return {
    ...CURRENT_FLOW_ORDER,
    productionItems: [{ ...CURRENT_FLOW_ORDER.productionItems![0], ...fields }],
  } as unknown as Order;
}

describe("reorderTarget", () => {
  it("takes GRIDGO's product code first", () => {
    expect(reorderTarget(CURRENT_FLOW_ORDER, REORDER_TREE, [])).toEqual({
      category: "marketing_collateral",
      subcategory: "flyers",
    });
  });

  it("falls back to the product family when the code is null or unknown", () => {
    const target = { category: "signage", subcategory: "tarpaulin" };
    expect(reorderTarget(OLD_SHAPE_ORDER, REORDER_TREE, REORDER_CATALOG)).toEqual(target);
    expect(
      reorderTarget({ ...OLD_SHAPE_ORDER, productionItems: withItem({ subcategoryCode: "retired" }).productionItems }, REORDER_TREE, REORDER_CATALOG),
    ).toEqual(target);
  });

  it("breaks a family shared by two products on the order's title, else the tree's first", () => {
    const catalog = [{ id: "prod_flyer", name: "Brochures / Flyers", family: "flyer" }] as unknown as CatalogProduct[];
    const flyer = { ...OLD_SHAPE_ORDER, productId: "prod_flyer" };
    expect(reorderTarget({ ...flyer, title: "Summer brochures" }, REORDER_TREE, catalog)?.subcategory).toBe("brochures");
    expect(reorderTarget({ ...flyer, title: "Handouts" }, REORDER_TREE, catalog)?.subcategory).toBe("flyers");
  });

  it("reads a tarpaulin as a tarpaulin, not as the first banner product", () => {
    const live = [
      {
        code: "marketing_collateral",
        subcategories: [{ code: "posters_standees", name: "Posters & standees", productFamilyIds: ["banner"] }],
      },
      {
        code: "recognition_awards_signage",
        subcategories: [{ code: "tarpaulins_outdoor_banners", name: "Tarpaulins & outdoor banners", productFamilyIds: ["banner"] }],
      },
    ] as never;
    const catalog = [{ id: "prod_tarpaulin", name: "Tarpaulin / Banner", family: "banner" }] as unknown as CatalogProduct[];
    expect(reorderTarget({ ...OLD_SHAPE_ORDER, title: "Handouts" }, live, catalog)?.subcategory).toBe("tarpaulins_outdoor_banners");
    expect(reorderTarget({ ...OLD_SHAPE_ORDER, title: "Posters for the fair" }, live, catalog)?.subcategory).toBe("posters_standees");
  });

  it("answers from the seed's families when GRIDGO's tree carries none", () => {
    const live = [
      { code: "marketing_collateral", name: "Marketing", subcategories: [{ code: "flyers", name: "Flyers", productFamilyIds: [] }] },
    ] as never;
    const catalog = [{ id: "prod_flyer", name: "Brochures / Flyers", family: "flyer" }] as unknown as CatalogProduct[];
    expect(reorderTarget({ ...OLD_SHAPE_ORDER, productId: "prod_flyer", title: "Menu cards" }, live, catalog)).toEqual({
      category: "marketing_collateral",
      subcategory: "flyers",
    });
  });

  it("gives up when nothing says, so the client chooses", () => {
    expect(reorderTarget(withItem({ subcategoryCode: null }), REORDER_TREE, [])).toBeNull();
    expect(reorderTarget(OLD_SHAPE_ORDER, REORDER_TREE, [])).toBeNull();
    expect(reorderTarget(OLD_SHAPE_ORDER, [], REORDER_CATALOG)).toBeNull();
    expect(reorderTarget({ ...OLD_SHAPE_ORDER, productId: "prod_gone" }, REORDER_TREE, REORDER_CATALOG)).toBeNull();
  });
});

describe("reorderFulfilment", () => {
  it("repeats a pick-up without a point", () => {
    expect(reorderFulfilment({ fulfillmentMode: "pickup", dropoff: null } as never)).toEqual({
      fulfillmentMode: "pickup",
      dropoff: null,
    });
  });

  it("repeats a delivery to a real point only", () => {
    expect(reorderFulfilment(CURRENT_FLOW_ORDER)?.dropoff?.label).toBe("Sample drop-off");
    expect(reorderFulfilment({ fulfillmentMode: "delivery", dropoff: { lat: NaN, lng: 1 } } as never)).toBeNull();
    expect(reorderFulfilment(OLD_SHAPE_ORDER)).toBeNull();
  });
});

describe("reorderAnswers", () => {
  it("never carries the deadline, shop, price or voucher", () => {
    expect(Object.keys(reorderAnswers(CURRENT_FLOW_ORDER)).sort()).toEqual(
      ["measureUnit", "measurement", "options", "packageQty", "pricingUnit", "quantity"].sort(),
    );
  });

  it("reads an old-shape order's specs as labels with no group", () => {
    expect(reorderAnswers(OLD_SHAPE_ORDER).options).toEqual([
      { groupName: null, label: "3x6 ft" },
      { groupName: null, label: "13oz tarpaulin" },
    ]);
  });
});

describe("reorderSheet", () => {
  const answers = reorderAnswers(CURRENT_FLOW_ORDER);

  it("carries an option the listing still offers, under the same group", () => {
    expect(reorderSheet(answers, listing()).selection).toEqual({ paper: "paper:Gloss" });
  });

  it("ignores case and stray spaces in names", () => {
    const item = listing({ optionGroups: [group("paper", " paper ", ["gloss "])] as never });
    expect(reorderSheet(answers, item).selection).toEqual({ paper: "paper:gloss " });
  });

  it("leaves an option the listing dropped unanswered", () => {
    const item = listing({ optionGroups: [group("paper", "Paper", ["Matte"])] as never });
    expect(reorderSheet(answers, item).selection).toEqual({});
  });

  it("does not move an answer into a different group with the same label", () => {
    const item = listing({ optionGroups: [group("coat", "Coating", ["Gloss"])] as never });
    expect(reorderSheet(answers, item).selection).toEqual({});
  });

  it("matches an old-shape order's labels against any group", () => {
    const item = listing({
      optionGroups: [group("size", "Size", ["3x6 ft"]), group("mat", "Material", ["13oz tarpaulin"])] as never,
    });
    expect(reorderSheet(reorderAnswers(OLD_SHAPE_ORDER), item).selection).toEqual({
      size: "size:3x6 ft",
      mat: "mat:13oz tarpaulin",
    });
  });

  it("keeps the count only where a unit means the same thing", () => {
    expect(reorderSheet(answers, listing()).quantity).toBe(2);
    expect(reorderSheet(answers, listing({ pricingUnit: "per_unit", packageQty: null })).quantity).toBeNull();
    expect(reorderSheet(answers, listing({ packageQty: 500 })).quantity).toBeNull();
    expect(reorderSheet(reorderAnswers(OLD_SHAPE_ORDER), listing({ pricingUnit: "per_area" })).quantity).toBe(3);
  });

  it("keeps a size only in the unit it was measured in", () => {
    const measured = reorderAnswers(withItem({ measurement: { widthMilli: 3000, heightMilli: 6000, unit: "ft" } }));
    expect(reorderSheet(measured, listing({ measureUnit: "ft" })).measured).toEqual(
      expect.objectContaining({ width: "3", height: "6" }),
    );
    expect(reorderSheet(measured, listing({ measureUnit: "m" })).measured).toBeNull();
    expect(reorderSheet(answers, listing({ measureUnit: "ft" })).measured).toBeNull();
  });
});

describe("reorderArtworkFileIds", () => {
  it("takes every file on the item and no design link", () => {
    const order = withItem({
      artworkAttachments: [
        { kind: "file", fileId: "file_front" },
        { kind: "link", url: "https://example.test/design", provider: "other_link" },
        { kind: "file", fileId: "file_back" },
      ],
    });
    expect(reorderArtworkFileIds(order)).toEqual(["file_front", "file_back"]);
  });

  it("takes the item's one file on an older payload", () => {
    expect(reorderArtworkFileIds(CURRENT_FLOW_ORDER)).toEqual(["file_flyer"]);
  });

  it("takes the latest file on an old-shape order", () => {
    expect(reorderArtworkFileIds({ ...OLD_SHAPE_ORDER, artworkFileIds: ["file_a", "file_b"] })).toEqual(["file_b"]);
    expect(reorderArtworkFileIds({ ...OLD_SHAPE_ORDER, artworkFileIds: [] })).toEqual([]);
  });
});

describe("reorderApplies", () => {
  const job = { subcategory: "flyers", lineId: null };

  it("holds for the job's own product until it has a line", () => {
    expect(reorderApplies(job, { subcategoryCode: "flyers" })).toBe(true);
    expect(reorderApplies({ ...job, lineId: "cline_1" }, { subcategoryCode: "flyers" })).toBe(false);
    expect(reorderApplies(job, { subcategoryCode: "tarpaulin" })).toBe(false);
    expect(reorderApplies(null, { subcategoryCode: "flyers" })).toBe(false);
  });
});

describe("reorderArtworkNote", () => {
  it("says what came along and what did not, or nothing", () => {
    expect(reorderArtworkNote("Flyers", [], [])).toBeNull();
    expect(reorderArtworkNote("Flyers", ["a.pdf"], [])).toBe(
      "a.pdf came from your past order. Remove it to use a different file.",
    );
    expect(reorderArtworkNote("Flyers", [], ["b.ai"])).toBe(
      "Flyers does not take b.ai from your past order. Upload a file here instead.",
    );
  });
});
