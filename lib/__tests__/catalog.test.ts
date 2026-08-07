import { familyLabel, formatUnitPrice, groupCatalogByFamily } from "@/lib/catalog";
import { MOCKUP_LABEL, templateForFamily } from "@/lib/productPreview";
import { formatPhp } from "@/lib/api";

describe("catalog grouping", () => {
  it("groups and orders families", () => {
    const groups = groupCatalogByFamily([
      { id: "1", name: "A", family: "apparel", basePriceMinor: 1, unit: "piece" },
      { id: "2", name: "B", family: "flyer", basePriceMinor: 1, unit: "pack100" },
      { id: "3", name: "C", family: "banner", basePriceMinor: 1, unit: "sqm" },
    ]);
    expect(groups.map((g) => g.family)).toEqual(["flyer", "banner", "apparel"]);
    expect(familyLabel("flyer")).toMatch(/Flyer/i);
  });

  it("formats unit prices", () => {
    expect(formatUnitPrice(2500, "pack100")).toMatch(/₱25\.00/);
    expect(formatUnitPrice(2500, "pack100")).toMatch(/per 100/);
  });
});

describe("product preview", () => {
  it("maps families to templates and keeps mockup label fixed", () => {
    expect(templateForFamily("banner")).toBe("tarpaulin");
    expect(templateForFamily("apparel")).toBe("tshirt");
    expect(MOCKUP_LABEL).toBe("Visual mockup — not print-ready proof.");
  });
});

describe("formatPhp", () => {
  it("formats minor units", () => {
    expect(formatPhp(150000)).toMatch(/1,500\.00|1500\.00/);
  });
});
