import { contrastRatio, promoCardColor, promoCardColors, readableInk } from "@/lib/promoCardColors";

const LIGHT_CANVAS = "#F8F8F8";
const DARK_CANVAS = "#000000";
const OUTLINE = "#DCDCDC";

describe("promo card colour (promo-color contract)", () => {
  it("prefers color and falls back to style for an older API", () => {
    expect(promoCardColor({ color: "#17a673", style: "light" })).toBe("#17A673");
    expect(promoCardColor({ color: null, style: "light" })).toBe("#FFFFFF");
    expect(promoCardColor({ color: null, style: "yellow" })).toBe("#FFDE58");
  });

  it("picks the ink with the higher contrast", () => {
    expect(readableInk("#FFFFFF")).toBe("#1A1A1A");
    expect(readableInk("#FFDE58")).toBe("#1A1A1A");
    expect(readableInk("#1A1A1A")).toBe("#FFFFFF");
    expect(readableInk("#17A673")).toBe("#1A1A1A");
    for (const bg of ["#FFFFFF", "#1A1A1A", "#FFDE58", "#17A673", "#1565C0"]) {
      expect(contrastRatio(bg, readableInk(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("derives muted ink at 72% and the chip from ink", () => {
    const card = promoCardColors({ color: "#1A1A1A", style: "light" }, LIGHT_CANVAS, OUTLINE);
    expect(card.ink).toBe("#FFFFFF");
    expect(card.muted).toBe("#FFFFFFB8");
    expect(card.chip).toBe("#FFFFFF1A");
  });

  it("draws a hairline only when the card is close to the screen behind it", () => {
    expect(promoCardColors({ color: "#FFFFFF", style: "light" }, LIGHT_CANVAS, OUTLINE).border).toBe(OUTLINE);
    expect(promoCardColors({ color: "#FFFFFF", style: "light" }, DARK_CANVAS, OUTLINE).border).toBe("#FFFFFF");
    expect(promoCardColors({ color: "#1A1A1A", style: "light" }, DARK_CANVAS, OUTLINE).border).toBe(OUTLINE);
    expect(promoCardColors({ color: "#17A673", style: "light" }, LIGHT_CANVAS, OUTLINE).border).toBe("#17A673");
  });
});
