import {
  promoLinkLabel,
  claimPromotionView,
  homeSlides,
  nextSlideIndex,
  promotionSessionId,
  promotionsFrom,
  promotionTagLabel,
  resetPromotionSession,
} from "@/lib/homePromos";

const davaogo = {
  id: "promo_1",
  name: "DavaoGo",
  logo: { fileId: "file_1", downloadUrl: "https://files.example/logo.png" },
  description: "Rides and deliveries around Davao.",
  tag: "partner",
  linkText: "Visit DavaoGo",
  linkUrl: "https://davaogo.app/",
  tapAction: "sheet",
  style: "yellow",
  status: "live",
  views: 4,
};

describe("promotionsFrom", () => {
  it("reads the feed in the order sent, with the logo's ready URL", () => {
    const promos = promotionsFrom({ promotions: [davaogo, { ...davaogo, id: "promo_2", name: "Second" }] });
    expect(promos.map((p) => p.id)).toEqual(["promo_1", "promo_2"]);
    expect(promos[0]).toEqual({
      id: "promo_1",
      name: "DavaoGo",
      logoUrl: "https://files.example/logo.png",
      imageUrl: null,
      description: "Rides and deliveries around Davao.",
      tag: "partner",
      linkText: "Visit DavaoGo",
      linkUrl: "https://davaogo.app/",
      tapAction: "sheet",
      style: "yellow",
    });
  });

  it("accepts a bare array and flat logoUrl/imageUrl fields", () => {
    const [promo] = promotionsFrom([{ ...davaogo, logo: undefined, logoUrl: "https://a/l.png", imageUrl: "https://a/i.jpg" }]);
    expect(promo.logoUrl).toBe("https://a/l.png");
    expect(promo.imageUrl).toBe("https://a/i.jpg");
  });

  it("drops a promo without an https link, a name or an id, and duplicates", () => {
    const promos = promotionsFrom({
      promotions: [
        { ...davaogo, linkUrl: "http://davaogo.app/" },
        { ...davaogo, linkUrl: "javascript:alert(1)" },
        { ...davaogo, name: " " },
        { ...davaogo, id: "" },
        davaogo,
        davaogo,
        "junk",
        null,
      ],
    });
    expect(promos.map((p) => p.id)).toEqual(["promo_1"]);
  });

  it("falls back to safe defaults for unknown values", () => {
    const [promo] = promotionsFrom([{ ...davaogo, tag: "new", tapAction: "popup", style: "neon", linkText: "" }]);
    expect(promo.tag).toBe("partner");
    expect(promo.tapAction).toBe("sheet");
    expect(promo.style).toBe("light");
    expect(promo.linkText).toBe("");
    expect(promoLinkLabel(promo)).toBe("Visit DavaoGo");
  });

  it("reads nothing from a missing or malformed body", () => {
    expect(promotionsFrom(null)).toEqual([]);
    expect(promotionsFrom({ promotions: "x" })).toEqual([]);
  });
});

describe("the rotation", () => {
  it("always leads with Reorder, and is only Reorder with no promos", () => {
    expect(homeSlides([])).toEqual([{ kind: "reorder" }]);
    const [promo] = promotionsFrom([davaogo]);
    expect(homeSlides([promo]).map((s) => s.kind)).toEqual(["reorder", "promo"]);
  });

  it("wraps back to Reorder", () => {
    expect(nextSlideIndex(0, 3)).toBe(1);
    expect(nextSlideIndex(2, 3)).toBe(0);
    expect(nextSlideIndex(0, 1)).toBe(0);
  });

  it("names every tag", () => {
    expect(promotionTagLabel("partner")).toBe("Partner");
    expect(promotionTagLabel("sponsored")).toBe("Sponsored");
    expect(promotionTagLabel("featured_shop")).toBe("Featured shop");
  });
});

describe("the app session", () => {
  beforeEach(() => resetPromotionSession());

  it("counts a view once per promo per session", () => {
    expect(claimPromotionView("promo_1")).toBe(true);
    expect(claimPromotionView("promo_1")).toBe(false);
    expect(claimPromotionView("promo_2")).toBe(true);
  });

  it("keeps one session id until the next launch", () => {
    const first = promotionSessionId();
    expect(promotionSessionId()).toBe(first);
    resetPromotionSession();
    expect(promotionSessionId()).not.toBe(first);
    expect(claimPromotionView("promo_1")).toBe(true);
  });
});
