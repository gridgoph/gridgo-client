import type { ArtworkGuidance, ArtworkGuidanceSettings } from "@/lib/api";
import {
  REPRINT_NOTE,
  acceptanceAfter,
  acceptanceLine,
  colorModeLabel,
  fileFacts,
  guidanceRule,
  orderFileGuidance,
  pixelsAt,
  prepareFileGuide,
  warningCopy,
} from "@/lib/artworkGuidance";
import { measuredSizeMilli, physicalSizeMilli } from "@/lib/printSize";

/**
 * GRIDGO's starting values (gridgo-api `docs/ARTWORK_GUIDANCE_API.md`,
 * migration `artwork_guidance`), as `GET /settings` sends them.
 */
const rule = (minimumDpi: number | null, acceptsRgb = false) => ({ minimumDpi, acceptsRgb });
const GROUPS = {
  documentsAndFlyers: {
    codes: ["document_printing", "booklets", "risograph", "binding_hardbound", "id_photos", "flyers", "brochures", "business_cards"],
    rule: rule(300),
  },
  posters: { codes: ["posters_standees"], rule: rule(200) },
  apparel: { codes: ["custom_apparel"], rule: rule(150, true) },
  largeFormat: {
    codes: ["tarpaulins_outdoor_banners", "business_store_signages", "blueprint_cad_plotting"],
    rule: rule(100),
  },
  paperStickersKeepsakes: {
    codes: [
      "stickers_packaging_labels",
      "certificates_diplomas",
      "corporate_giveaways",
      "drinkware",
      "lanyards_id_accessories",
      "plaques_trophies",
      "medals_ribbons",
      "packaging_box_production",
    ],
    rule: rule(300),
  },
  modelFiles: { codes: ["three_d_printing_scale_models"], rule: rule(null, true) },
};
const SETTINGS: ArtworkGuidanceSettings = {
  version: 1,
  default: rule(300),
  subcategories: Object.fromEntries(
    Object.values(GROUPS).flatMap((group) => group.codes.map((code) => [code, group.rule])),
  ),
};

describe("each product type's targets come from GRIDGO", () => {
  it.each(Object.entries(GROUPS))("%s", (_name, group) => {
    for (const code of group.codes) expect(guidanceRule(SETTINGS, code)).toEqual(group.rule);
  });

  it("uses the default for a product type added later", () => {
    expect(guidanceRule(SETTINGS, "neon_signs")).toEqual(rule(300));
    expect(guidanceRule(SETTINGS, null)).toEqual(rule(300));
  });

  it("follows a Super Admin edit, with no number of its own", () => {
    const edited = { ...SETTINGS, subcategories: { ...SETTINGS.subcategories, flyers: rule(250, true) } };
    expect(guidanceRule(edited, "flyers")).toEqual(rule(250, true));
  });

  it("has nothing to say on an API without the setting", () => {
    expect(guidanceRule(undefined, "flyers")).toBeNull();
    expect(prepareFileGuide(guidanceRule(undefined, "flyers"))).toBeNull();
  });
});

describe("the Prepare your file guide", () => {
  const guide = (code: string, size?: string, subcategoryCode?: string) =>
    prepareFileGuide(guidanceRule(SETTINGS, code), {
      milli: size ? physicalSizeMilli(size, { subcategoryCode }) : null,
      label: size,
    });

  it("gives CMYK advice for paper, documents, stickers and signage", () => {
    for (const code of ["flyers", "document_printing", "stickers_packaging_labels", "business_store_signages", "blueprint_cad_plotting"]) {
      expect(guide(code)?.[0]).toMatchObject({ id: "colour", title: "Save it in CMYK" });
      expect(guide(code)?.[0].body).toMatch(/RGB file can print duller/);
    }
  });

  it("says RGB is accepted for apparel", () => {
    expect(guide("custom_apparel")?.[0]).toMatchObject({ id: "colour", title: "RGB accepted" });
  });

  it("states each product type's resolution, measured at the printed size", () => {
    expect(guide("flyers")?.[1].title).toBe("300 DPI at the printed size");
    expect(guide("posters_standees")?.[1].title).toBe("200 DPI at the printed size");
    expect(guide("custom_apparel")?.[1].title).toBe("150 DPI at the printed size");
    expect(guide("tarpaulins_outdoor_banners")?.[1].title).toBe("100 DPI at the printed size");
  });

  it("turns the target into pixels for the size ordered", () => {
    expect(guide("flyers", "A5")?.[1].body).toMatch(/^For A5 that is about 1748 × 2480 pixels\./);
    expect(guide("business_cards", "Standard", "business_cards")?.[1].body).toMatch(/about 1050 × 600 pixels/);
    // A 3 x 6 ft tarpaulin at 100 DPI, not a flyer's 300.
    expect(guide("tarpaulins_outdoor_banners", "3 x 6 ft")?.[1].body).toMatch(/about 3600 × 7200 pixels/);
    expect(pixelsAt(measuredSizeMilli({ width: 3_000, height: 5_000 }, "ft")!, 100)).toEqual({ width: 3600, height: 6000 });
  });

  it("says nothing for model files, which check neither", () => {
    expect(guide("three_d_printing_scale_models")).toBeNull();
  });
});

const LINE: ArtworkGuidance = {
  subcategoryCode: "tarpaulins_outdoor_banners",
  minimumDpi: 100,
  acceptsRgb: false,
  expectedColorMode: "cmyk",
  orderedSize: { widthMilli: 914_400, heightMilli: 1_828_800 },
  files: [
    {
      fileId: "file_a",
      colorMode: "rgb",
      pixelWidth: 1200,
      pixelHeight: 2400,
      effectiveDpi: 33,
      warnings: [
        { code: "low_resolution", effectiveDpi: 33, minimumDpi: 100, acceptedAt: "2026-10-16T07:42:00.000Z" },
        { code: "color_mode", colorMode: "rgb", expectedColorMode: "cmyk", acceptedAt: null },
      ],
    },
    { fileId: "file_b", colorMode: "cmyk", pixelWidth: 3600, pixelHeight: 7200, effectiveDpi: 100, warnings: [] },
  ],
  openWarningCount: 1,
};

describe("after upload", () => {
  it("shows the detected colour mode and the resolution at the size ordered", () => {
    expect(fileFacts(LINE.files[0], LINE)).toEqual([
      { id: "colour", label: "Colour", value: "RGB" },
      { id: "resolution", label: "Resolution", value: "33 DPI at the size ordered, 100 recommended" },
    ]);
  });

  it("says nothing it does not know: no colour stated, no pixels", () => {
    expect(fileFacts({ ...LINE.files[0], colorMode: null, effectiveDpi: null }, LINE)).toEqual([]);
  });

  it("names every colour mode GRIDGO reads, and none it does not", () => {
    expect(["rgb", "cmyk", "grayscale", "mixed"].map(colorModeLabel)).toEqual([
      "RGB",
      "CMYK",
      "Greyscale",
      "RGB and CMYK mixed",
    ]);
    expect(colorModeLabel(null)).toBeNull();
    expect(colorModeLabel("lab")).toBeNull();
  });

  it("words each warning with GRIDGO's figures", () => {
    const [low, colour] = LINE.files[0].warnings;
    expect(warningCopy(low).body).toBe(
      "This file prints at 33 DPI at the size you ordered. 100 DPI is recommended for this product, so it may look soft or blurry.",
    );
    expect(warningCopy(colour)).toMatchObject({ title: "RGB file", accept: "Print it in these colours" });
    expect(warningCopy({ code: "bleed_missing" }).title).toBe("Check this file");
  });

  it("says the free reprint promise does not cover an accepted warning", () => {
    expect(REPRINT_NOTE).toMatch(/free reprint promise does not cover it/);
  });
});

describe("the acceptance sent to GRIDGO", () => {
  it("adds a ticked warning to the ones already accepted", () => {
    expect(acceptanceAfter(LINE, { fileId: "file_a", code: "color_mode", accept: true })).toEqual([
      { fileId: "file_a", code: "low_resolution" },
      { fileId: "file_a", code: "color_mode" },
    ]);
  });

  it("drops an unticked one and keeps the rest", () => {
    expect(acceptanceAfter(LINE, { fileId: "file_a", code: "low_resolution", accept: false })).toEqual([]);
  });

  it("never names a warning the line does not have now", () => {
    expect(acceptanceAfter(LINE, { fileId: "file_b", code: "low_resolution", accept: true })).toEqual([
      { fileId: "file_a", code: "low_resolution" },
    ]);
  });
});

describe("the record on the order", () => {
  it("finds each file's check, and says whether the client accepted each warning", () => {
    const records = orderFileGuidance([
      { itemName: "Store tarpaulin", artworkGuidance: LINE },
      { itemName: "Old order item", artworkGuidance: null },
    ]);
    expect(records.get("file_a")).toMatchObject({ itemName: "Store tarpaulin", minimumDpi: 100 });
    expect(records.size).toBe(2);
    const [low, colour] = records.get("file_a")!.file.warnings;
    expect(acceptanceLine(low)).toBe("Accepted 16 Oct, 3:42 PM");
    expect(acceptanceLine(colour)).toBe("Not accepted");
  });
});
