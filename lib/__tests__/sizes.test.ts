import { describeSize, isPresetSize, sizeCatalogFor } from "@/lib/sizes";

describe("sizeCatalogFor", () => {
  it("offers the sizes a trade actually prints", () => {
    expect(sizeCatalogFor("banner").options.map((o) => o.value)).toContain("3x6 ft");
    expect(sizeCatalogFor("flyer").options.map((o) => o.value)).toContain("A5");
  });

  it("allows a custom size only where the trade cuts to order", () => {
    expect(sizeCatalogFor("banner").allowCustom).toBe(true);
    expect(sizeCatalogFor("card").allowCustom).toBe(false);
    expect(sizeCatalogFor("apparel").allowCustom).toBe(false);
  });

  it("says the constraint before the client hits it", () => {
    expect(sizeCatalogFor("banner").customHint).toMatch(/Operations confirms/i);
  });

  it("still allows a custom size for a product it has no presets for", () => {
    const fallback = sizeCatalogFor("hologram");
    expect(fallback.options).toEqual([]);
    expect(fallback.allowCustom).toBe(true);
  });
});

describe("isPresetSize", () => {
  it("separates a chosen preset from typed words", () => {
    expect(isPresetSize("banner", "3x6 ft")).toBe(true);
    expect(isPresetSize("banner", "about 3 by 6")).toBe(false);
    expect(isPresetSize("banner", " ")).toBe(false);
  });
});

describe("describeSize", () => {
  it("reads back a preset in its own words", () => {
    expect(describeSize("banner", "3x6 ft")).toBe("3 × 6 ft");
    expect(describeSize("apparel", "L")).toBe("Large");
  });

  it("marks a custom size as custom so nobody mistakes it for a standard", () => {
    expect(describeSize("banner", "4 x 12 ft")).toBe("4 x 12 ft (custom)");
  });

  it("says nothing is chosen rather than showing an empty string", () => {
    expect(describeSize("banner", "")).toBe("—");
  });
});
