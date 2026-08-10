import {
  clampQuantity,
  describeQuantity,
  quantityBounds,
  quantityLimitNote,
} from "@/lib/quantity";

describe("quantityBounds", () => {
  it("gives each catalog unit its own ceiling", () => {
    expect(quantityBounds("sqm").max).toBe(500);
    expect(quantityBounds("sheet").max).toBe(2000);
  });

  it("falls back rather than leaving an unknown unit unbounded", () => {
    const bounds = quantityBounds("furlong");
    expect(bounds.min).toBe(1);
    expect(Number.isFinite(bounds.max)).toBe(true);
  });
});

describe("clampQuantity", () => {
  it("holds the value inside its bounds", () => {
    expect(clampQuantity(0, "sqm")).toBe(1);
    expect(clampQuantity(9999, "sqm")).toBe(500);
    expect(clampQuantity(12, "sqm")).toBe(12);
  });

  it("recovers from a non-numeric value", () => {
    expect(clampQuantity(Number.NaN, "piece")).toBe(1);
  });
});

describe("describeQuantity", () => {
  it("says what a number actually buys", () => {
    expect(describeQuantity(4, "pack100")).toBe("4 packs of 100");
    expect(describeQuantity(1, "pack100")).toBe("1 pack of 100");
    expect(describeQuantity(3, "sqm")).toBe("3 sqm");
  });
});

describe("quantityLimitNote", () => {
  it("explains a stopped stepper rather than leaving it silent", () => {
    expect(quantityLimitNote(500, "sqm")).toMatch(/500 sqm/);
    expect(quantityLimitNote(10, "sqm")).toBeNull();
  });
});
