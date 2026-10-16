import type { CartLineRecord, ColourPage, ColourPricing, ProductionItem } from "@/lib/api";
import { withPrepareFileAdvice } from "@/lib/artworkGuidance";
import { blockerLine, placeOrderBlockers } from "@/lib/checkout";
import { unpricedLineReason } from "@/lib/clientPrice";
import {
  colourAwaitsPriceCheck,
  colourBlocksCheckout,
  colourRefusalOf,
  colourStatusView,
  coverageText,
  linePageCount,
  oneColourWarning,
  pageLine,
  pageUnpricedNote,
  sheetsLine,
  tierLabel,
  tierMarks,
} from "@/lib/colourPricing";
import { productionSpecRows } from "@/lib/productionSpecs";

const WARNING =
  "Your file has colour, but this service prints in one colour. Choose a colour service if you need the colours.";

function page(overrides: Partial<ColourPage> = {}): ColourPage {
  return {
    fileId: "file_pdf",
    page: 1,
    strongColourBps: 0,
    tier: "none",
    sheetPriceMinor: 4350,
    clientSheetPriceMinor: 4350,
    clientPageTotalMinor: 13050,
    status: "priced",
    ...overrides,
  };
}

function pricing(overrides: Partial<ColourPricing> = {}): ColourPricing {
  return {
    version: 1,
    status: "priced",
    pricedByColour: true,
    quantityMode: "document_sets",
    quantity: 3,
    totalSheets: 6,
    tierSet: "large_format",
    clientLineSubtotalMinor: 39150,
    warning: null,
    pages: [page(), page({ page: 2, strongColourBps: 1800, tier: "up_to_25", sheetPriceMinor: 8700, clientSheetPriceMinor: 8700 })],
    ...overrides,
  };
}

function line(colour: ColourPricing | null, listing: Partial<CartLineRecord["listing"]> = { pricedByColour: true }) {
  return {
    listing: listing as CartLineRecord["listing"],
    colourPricing: colour,
    quantity: colour?.quantity ?? 1,
    documentPages: null,
  } as unknown as CartLineRecord;
}

describe("coverageText", () => {
  it("keeps a page with no strong colour at exactly 0%", () => {
    expect(coverageText(0)).toBe("0%");
  });

  it("never rounds some strong colour down to 0%", () => {
    expect(coverageText(1)).toBe("0.1%");
    expect(coverageText(4)).toBe("0.1%");
  });

  it("reads whole percentages without decimals and rounds a fraction up", () => {
    expect(coverageText(1800)).toBe("18%");
    expect(coverageText(1699)).toBe("17%");
    expect(coverageText(8013)).toBe("80.2%");
    expect(coverageText(10000)).toBe("100%");
  });
});

describe("tiers", () => {
  it("names every level in words, with A3's limit from GRIDGO's setting", () => {
    expect(tierLabel("none")).toBe("No strong colour");
    expect(tierLabel("up_to_25")).toBe("Up to 25% colour");
    expect(tierLabel("up_to_50")).toBe("Up to 50% colour");
    expect(tierLabel("above_50")).toBe("Over 50% colour");
    expect(tierLabel("monochrome")).toBe("Monochrome, up to 10%");
    expect(tierLabel("full_colour", 1500)).toBe("Full colour, over 15%");
    expect(tierLabel(null)).toBeNull();
  });

  it("marks the level boundaries for the ruler", () => {
    expect(tierMarks("large_format")).toEqual([25, 50]);
    expect(tierMarks("a3", 1200)).toEqual([12]);
    expect(tierMarks(null)).toEqual([]);
  });
});

describe("pageLine", () => {
  it("says the colour level and the all-in sheet price, as the report writes it", () => {
    expect(pageLine(page({ page: 3, strongColourBps: 1800, sheetPriceMinor: 6000, clientSheetPriceMinor: 6000 }), ["file_pdf"], { showPrice: true }))
      .toBe("Page 3: 18% strong colour, ₱60.00");
  });

  it("says a page with no shop rate needs a price check instead of a price", () => {
    const unpriced = page({ page: 4, strongColourBps: 8013, tier: "above_50", sheetPriceMinor: null, clientSheetPriceMinor: null, status: "needs_price_check" });
    expect(pageLine(unpriced, ["file_pdf"], { showPrice: true })).toBe("Page 4: 80.2% strong colour. This page needs a price check");
  });

  it("names the file when the line has more than one", () => {
    expect(pageLine(page({ fileId: "file_b", page: 1 }), ["file_a", "file_b"], { showPrice: false })).toBe("File 2, page 1: 0% strong colour");
  });
});

describe("sheetsLine", () => {
  it("counts sets of the whole document", () => {
    expect(sheetsLine("document_sets", 3, 12)).toBe("3 sets × 12 pages = 36 sheets");
  });

  it("counts copies of each page, in the singular too", () => {
    expect(sheetsLine("copies_each_page", 1, 1)).toBe("1 copy × 1 page = 1 sheet");
    expect(sheetsLine("copies_each_page", 2, 4)).toBe("2 copies × 4 pages = 8 sheets");
  });

  it("takes GRIDGO's sheet count rather than multiplying again", () => {
    expect(sheetsLine("document_sets", 3, 2, 6)).toBe("3 sets × 2 pages = 6 sheets");
  });

  it("says nothing before copies or sets are chosen", () => {
    expect(sheetsLine(null, 3, 12)).toBeNull();
  });

  it("counts the measured pages, else the document's", () => {
    expect(linePageCount(line(pricing()))).toBe(2);
    expect(linePageCount({ colourPricing: null, documentPages: { total: 12, range: null, printed: 12 } })).toBe(12);
  });
});

describe("where a colour line stands", () => {
  it("says nothing once priced, and nothing for a one-colour fixed price", () => {
    expect(colourStatusView(pricing())).toBeNull();
    expect(colourStatusView(pricing({ status: "fixed_price", pricedByColour: false }))).toBeNull();
  });

  it("offers a retry when measuring failed and asks for copies or sets", () => {
    expect(colourStatusView(pricing({ status: "failed" }))?.action).toBe("retry");
    expect(colourStatusView(pricing({ status: "quantity_mode_required" }))?.action).toBe("choose_mode");
  });

  it("explains a price check, and that GRIDGO never fills a price in", () => {
    expect(colourStatusView(pricing({ status: "needs_price_check" }))?.body).toMatch(/GRIDGO never sets a price itself/);
  });

  it("treats an unknown status as not ready, never priced", () => {
    const view = colourStatusView(pricing({ status: "renderer_busy" }));
    expect(view?.tone).toBe("info");
    expect(colourBlocksCheckout(line(pricing({ status: "renderer_busy" })))).toBe(true);
  });

  it("blocks checkout until every page is priced, but never for one colour", () => {
    expect(colourBlocksCheckout(line(pricing()))).toBe(false);
    expect(colourBlocksCheckout(line(pricing({ status: "pending" })))).toBe(true);
    expect(colourAwaitsPriceCheck(line(pricing({ status: "needs_price_check" })))).toBe(true);
    expect(colourAwaitsPriceCheck(line(pricing({ status: "pending" })))).toBe(false);
    const mono = line(pricing({ status: "pending", pricedByColour: false }), { oneColour: true });
    expect(colourBlocksCheckout(mono)).toBe(false);
  });

  it("passes GRIDGO's one-colour warning through word for word", () => {
    expect(oneColourWarning(pricing({ status: "fixed_price", pricedByColour: false, warning: WARNING }))).toBe(WARNING);
    expect(oneColourWarning(pricing())).toBeNull();
  });

  it("gives a basket row the colour reason rather than a quantity one", () => {
    const pending = { ...line(pricing({ status: "needs_price_check", clientLineSubtotalMinor: null })), listing: { pricedByColour: true, minimumOrderQuantity: 10 } } as unknown as CartLineRecord;
    expect(unpricedLineReason(pending)).toMatch(/price check/);
  });

  it("says why a measured page has no price yet, in the line's own terms", () => {
    expect(pageUnpricedNote(pricing({ status: "quantity_mode_required" }))).toBe("Priced once you choose copies or sets");
    expect(pageUnpricedNote(pricing({ status: "needs_price_check" }))).toBe("Priced after the price check");
    expect(pageUnpricedNote(pricing({ status: "pending" }))).toBe("Not priced yet");
  });
});

describe("checkout refusals and blockers", () => {
  it("reads checkout's colour refusals and the line they are about", () => {
    expect(colourRefusalOf({ error: "colour_price_check_required", lineId: "cline_1" })).toEqual({ code: "colour_price_check_required", lineId: "cline_1" });
    expect(colourRefusalOf({ error: "colour_analysis_required" })).toEqual({ code: "colour_analysis_required", lineId: null });
    expect(colourRefusalOf({ error: "print_layout_required" })).toBeNull();
  });

  it("puts an unpriced colour page among the things to fix, with its own words", () => {
    const blockers = placeOrderBlockers({
      lineCount: 1,
      linesMissingArtwork: 0,
      linesColourPriceCheck: 1,
      linesMissingDropoff: 0,
      referenceOk: true,
      hasProof: true,
      hasSettings: true,
    });
    expect(blockers).toEqual(["colour_price_check"]);
    expect(blockerLine("colour_price_check", "Whiteprint plans")).toMatch(/A page of Whiteprint plans needs a price check/);
    expect(blockerLine("colour", "Whiteprint plans")).toMatch(/not finished pricing Whiteprint plans by colour/);
  });
});

describe("the order's record", () => {
  it("says copies or sets and the sheets in the specification", () => {
    const item = { id: "l", itemName: "Plans", quantity: 3, pricingUnit: "per_page", packageQty: null, measurement: null,
      structuredSpec: {}, options: [], artworkFileId: null, mockupFileId: null, quantityMode: "document_sets", totalSheets: 36 } as ProductionItem;
    const rows = productionSpecRows(item);
    expect(rows).toContainEqual({ label: "Copies", value: "Sets of the whole document" });
    expect(rows).toContainEqual({ label: "Sheets", value: "36" });
  });
});

describe("Prepare your file", () => {
  it("recommends 300 to 600 DPI and says resolution does not change the price", () => {
    const rows = withPrepareFileAdvice(
      [
        { id: "colour", title: "RGB accepted", body: "" },
        { id: "resolution", title: "150 DPI at the printed size", body: "" },
      ],
      { recommendedDpi: { min: 300, max: 600 }, resolutionAffectsPrice: false },
    );
    expect(rows?.map((row) => row.title)).toEqual(["RGB accepted", "300 to 600 DPI"]);
    expect(rows?.[1].body).toMatch(/Resolution does not change the price/);
  });

  it("draws the advice alone when the product type has no targets", () => {
    expect(withPrepareFileAdvice(null, { recommendedDpi: { min: 300, max: 600 }, resolutionAffectsPrice: false })).toHaveLength(1);
    expect(withPrepareFileAdvice(null, null)).toBeNull();
  });
});
