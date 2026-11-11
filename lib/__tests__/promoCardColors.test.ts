import { contrastRatio, promoCardColor, promoCardColors, promoShowsCardImage, readableInk } from "@/lib/promoCardColors";

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

  it("draws white ink over a card image, whatever the colour behind it (client#425)", () => {
    for (const screen of [LIGHT_CANVAS, DARK_CANVAS]) {
      const card = promoCardColors({ color: "#FFFFFF", style: "light" }, screen, OUTLINE, true);
      expect(card.ink).toBe("#FFFFFF");
      // The colour stays behind the picture while it loads.
      expect(card.background).toBe("#FFFFFF");
      // A dark wash, so the tag reads on the top of any picture.
      expect(card.chip).toBe("#00000073");
      expect(card.border).toBe("#FFFFFF");
    }
  });

  it("draws the card image only while one is set and has not failed", () => {
    const none = new Set<string>();
    expect(promoShowsCardImage({ cardImageUrl: null }, none)).toBe(false);
    expect(promoShowsCardImage({ cardImageUrl: "https://a/card.jpg" }, none)).toBe(true);
    expect(promoShowsCardImage({ cardImageUrl: "https://a/card.jpg" }, new Set(["https://a/card.jpg"]))).toBe(false);
    // A fresh signed link from the next feed read gets its own attempt.
    expect(promoShowsCardImage({ cardImageUrl: "https://a/card.jpg?v=2" }, new Set(["https://a/card.jpg"]))).toBe(true);
  });
});
