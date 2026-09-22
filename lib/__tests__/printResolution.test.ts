import {
  artworkPrintSizeWarning,
  measuredSizeMilli,
  physicalSizeMilli,
  pixelsNeeded,
  printResolution,
  targetDpi,
} from "@/lib/printResolution";

describe("reading a size label as a physical size", () => {
  it("knows the paper the size lists offer", () => {
    expect(physicalSizeMilli("A5")).toEqual({ width: 148_000, height: 210_000 });
    expect(physicalSizeMilli("a4")).toEqual({ width: 210_000, height: 297_000 });
    expect(physicalSizeMilli("DL")).toEqual({ width: 99_000, height: 210_000 });
  });

  it("ignores a qualifier that does not change the paper", () => {
    // "A4 sheet" means several items printed up on A4. The sheet is still A4.
    expect(physicalSizeMilli("A4 sheet")).toEqual({ width: 210_000, height: 297_000 });
  });

  it("reads an explicit pair in the unit it is written in", () => {
    expect(physicalSizeMilli("90x50 mm")).toEqual({ width: 90_000, height: 50_000 });
    expect(physicalSizeMilli("3 × 6 ft")).toEqual({ width: 914_400, height: 1_828_800 });
    expect(physicalSizeMilli("24 x 36 in")).toEqual({ width: 609_600, height: 914_400 });
  });

  it("refuses a size it cannot actually measure", () => {
    // A custom size nobody has stated is not something to guess at: a made-up
    // dimension produces a confident warning about a number GRIDGO invented.
    expect(physicalSizeMilli("custom")).toBeNull();
    expect(physicalSizeMilli("")).toBeNull();
    expect(physicalSizeMilli("3 x 6 bananas")).toBeNull();
    // Two different units in one pair is a label nobody can act on.
    expect(physicalSizeMilli("3 ft x 6 mm")).toBeNull();
  });

  it("reads the size codes the shop listings actually bind", () => {
    expect(physicalSizeMilli("A2")).toEqual({ width: 420_000, height: 594_000 });
    expect(physicalSizeMilli("Short")).toEqual({ width: 215_900, height: 279_400 });
    expect(physicalSizeMilli("standard")).toBeNull();
    expect(
      physicalSizeMilli("standard", { subcategoryCode: "business_cards" }),
    ).toEqual({ width: 88_900, height: 50_800 });
  });
});

describe("when the file is not the product size", () => {
  const screenshot = { widthMilli: 190_500, heightMilli: 423_300 };

  it("warns a screenshot that is not the ordered card", () => {
    const warning = artworkPrintSizeWarning(
      screenshot,
      physicalSizeMilli("standard", { subcategoryCode: "business_cards" }),
      "standard",
    );
    expect(warning).toContain("190.5 × 423.3 mm");
    expect(warning).toContain("standard");
    expect(warning).toContain("do not match");
  });

  it("stays quiet when the file is the product", () => {
    expect(
      artworkPrintSizeWarning(
        { widthMilli: 148_000, heightMilli: 210_000 },
        physicalSizeMilli("A5"),
        "A5",
      ),
    ).toBeNull();
  });
});

describe("what this size of job is printed at", () => {
  it("wants 300 DPI for something held in the hand", () => {
    expect(targetDpi({ width: 148_000, height: 210_000 })).toBe(300);
  });

  it("wants 100 DPI for something read across a car park", () => {
    // Nobody prints a tarpaulin at 300 DPI, and failing one against a
    // leaflet's standard is a warning that teaches clients to ignore warnings.
    expect(targetDpi({ width: 914_400, height: 1_828_800 })).toBe(100);
  });
});

describe("the resolution an upload will actually print at", () => {
  it("names the captain's own file for what it is", () => {
    // 540 x 720 pixels on A5, which the screen was showing as two unrelated
    // facts. The long side is the limiting one — 720 pixels over 210 mm — so
    // it is 87 DPI, not the 93 the short side alone suggests. The byte-count
    // guess beside it was right by accident rather than by measurement.
    const read = printResolution({ width: 540, height: 720 }, physicalSizeMilli("A5"));
    expect(read?.dpi).toBe(87);
    expect(read?.verdict).toBe("low");
    expect(read?.message).toContain("blocky");
  });

  it("passes artwork exported for print", () => {
    // A5 at 300 DPI is 1748 x 2480.
    const read = printResolution({ width: 1748, height: 2480 }, physicalSizeMilli("A5"));
    expect(read?.dpi).toBe(300);
    expect(read?.verdict).toBe("good");
  });

  it("passes a banner that would fail a leaflet's standard", () => {
    // 1200 x 2400 on 3 x 6 ft is 33 DPI... at 100 it needs 3600 wide. This one
    // is a real large-format file at 100 DPI: 3600 x 7200.
    const read = printResolution({ width: 3600, height: 7200 }, physicalSizeMilli("3 x 6 ft"));
    expect(read?.verdict).toBe("good");
    expect(read?.target).toBe(100);
  });

  it("calls the middle ground workable rather than failing it", () => {
    // A5 at ~150 DPI. Softer than ideal, and a judgement the client is
    // entitled to make rather than one to block them on.
    const read = printResolution({ width: 874, height: 1240 }, physicalSizeMilli("A5"));
    expect(read?.verdict).toBe("workable");
    expect(read?.message).toContain("still run");
  });

  it("judges the limiting side, not an average", () => {
    // Generous across and thin down prints as thin: the short side is what
    // shows, and averaging the two hides exactly the file worth warning about.
    const read = printResolution({ width: 4000, height: 400 }, physicalSizeMilli("A5"));
    expect(read?.verdict).toBe("low");
  });

  it("does not care which way round the file is", () => {
    // A landscape file on a portrait size is the fit warning's business. If
    // this also fired, one mistake would produce two unrelated complaints.
    const portrait = printResolution({ width: 1748, height: 2480 }, physicalSizeMilli("A5"));
    const landscape = printResolution({ width: 2480, height: 1748 }, physicalSizeMilli("A5"));
    expect(landscape?.dpi).toBe(portrait?.dpi);
  });

  it("says nothing when it does not know one of the two numbers", () => {
    expect(printResolution(null, physicalSizeMilli("A5"))).toBeNull();
    expect(printResolution({ width: 540, height: 720 }, null)).toBeNull();
  });
});

describe("what a better file would have to be", () => {
  it("states the pixels that would reach the target", () => {
    expect(pixelsNeeded(physicalSizeMilli("A5"))).toEqual({ width: 1748, height: 2480 });
  });
});


describe("a listing the client measured rather than picked a size for", () => {
  it("reads a 3 by 5 foot banner as its real size", () => {
    // Billed by the square foot, so there is no "A4" to look up. 3 ft is
    // 914.4 mm, and the platform stores it as 3000 thousandths of a foot.
    expect(measuredSizeMilli({ width: 3_000, height: 5_000 }, "ft")).toEqual({
      width: 914_400,
      height: 1_524_000,
    });
  });

  it("judges a screenshot sent for a banner at the banner's own standard", () => {
    // The case this exists for. 1080 x 1920 on a 3 x 5 ft tarpaulin is 30 DPI
    // against large format's 100 — and before this the check said nothing at
    // all, because the line had no size label to read.
    const read = printResolution(
      { width: 1080, height: 1920 },
      measuredSizeMilli({ width: 3_000, height: 5_000 }, "ft"),
    );
    expect(read?.target).toBe(100);
    expect(read?.verdict).toBe("low");
  });

  it("works in every unit a shop may price in", () => {
    expect(measuredSizeMilli({ width: 500, height: 700 }, "m")?.width).toBe(500_000);
    expect(measuredSizeMilli({ width: 2_000, height: 3_000 }, "in")?.width).toBe(50_800);
    expect(measuredSizeMilli({ width: 100_000, height: 200_000 }, "mm")?.width).toBe(100_000);
  });

  it("says nothing rather than guessing a unit", () => {
    // A width with no unit is not a size, and inventing one produces a
    // confident warning about a dimension nobody stated.
    expect(measuredSizeMilli({ width: 3_000, height: 5_000 }, null)).toBeNull();
    expect(measuredSizeMilli({ width: 3_000, height: 5_000 }, "furlong")).toBeNull();
    expect(measuredSizeMilli({ width: 3_000 }, "ft")).toBeNull();
  });
});
