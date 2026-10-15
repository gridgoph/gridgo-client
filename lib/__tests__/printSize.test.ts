import { measuredSizeMilli, physicalSizeMilli } from "@/lib/printSize";

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

describe("a listing the client measured rather than picked a size for", () => {
  it("reads a 3 by 5 foot banner as its real size", () => {
    // Billed by the square foot, so there is no "A4" to look up. 3 ft is
    // 914.4 mm, and the platform stores it as 3000 thousandths of a foot.
    expect(measuredSizeMilli({ width: 3_000, height: 5_000 }, "ft")).toEqual({
      width: 914_400,
      height: 1_524_000,
    });
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
