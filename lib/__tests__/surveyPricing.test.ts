import {
  DEFAULT_SURVEY_OPTIONS,
  EMPTY_SURVEY_DRAFT,
  NOT_WORTH_IT,
  canSend,
  directShopLabel,
  missingLine,
  offersNotWorthIt,
  priceWorthLabel,
  priceWorthTagsFor,
  requiredAnswered,
  toSubmission,
  toggleChoice,
  toggleWorthTag,
  type SurveyDraft,
} from "@/lib/survey";

/* The three pricing questions (gridgo-api `docs/PRICING_FEEDBACK_API.md`). */

const counted: SurveyDraft = { ...EMPTY_SURVEY_DRAFT, fulfillmentStars: 4, easeStars: 5, priceFeeling: 3 };

describe("the reward rule is unchanged by the pricing questions", () => {
  it("never counts a pricing answer towards the three", () => {
    const pricingOnly: SurveyDraft = {
      ...EMPTY_SURVEY_DRAFT,
      directShopComparison: "cheaper",
      priceWorthTags: ["on_time"],
      orderAgainAtPrice: "yes",
    };
    expect(requiredAnswered(pricingOnly)).toBe(0);
    expect(canSend(pricingOnly)).toBe(false);
    expect(missingLine(pricingOnly, "delivery")).toBe("Rate the delivery to continue.");
  });

  it("is ready with the three counted answers and no pricing answers at all", () => {
    expect(requiredAnswered(counted)).toBe(3);
    expect(canSend(counted)).toBe(true);
  });
});

describe("the body GRIDGO takes", () => {
  it("sends the three pricing answers as GRIDGO's codes", () => {
    const body = toSubmission(
      { ...counted, directShopComparison: "much_cheaper", priceWorthTags: ["on_time", "no_shop_visits"], orderAgainAtPrice: "maybe" },
      "delivery",
      DEFAULT_SURVEY_OPTIONS,
    );
    expect(body.directShopComparison).toBe("much_cheaper");
    expect(body.priceWorthTags).toEqual(["on_time", "no_shop_visits"]);
    expect(body.orderAgainAtPrice).toBe("maybe");
  });

  it("sends null and an empty list when they are left alone", () => {
    const body = toSubmission(counted, "delivery", null);
    expect(body.directShopComparison).toBeNull();
    expect(body.priceWorthTags).toEqual([]);
    expect(body.orderAgainAtPrice).toBeNull();
  });

  it("drops answers GRIDGO's list does not offer", () => {
    const body = toSubmission(
      { ...counted, directShopComparison: "free", priceWorthTags: ["on_time", "magic"], orderAgainAtPrice: "always" },
      "delivery",
      { ...DEFAULT_SURVEY_OPTIONS },
    );
    expect(body.directShopComparison).toBeNull();
    expect(body.priceWorthTags).toEqual(["on_time"]);
    expect(body.orderAgainAtPrice).toBeNull();
  });

  it("sends 'not worth it' alone", () => {
    const body = toSubmission({ ...counted, priceWorthTags: ["on_time", NOT_WORTH_IT] }, "delivery", null);
    expect(body.priceWorthTags).toEqual([NOT_WORTH_IT]);
  });

  it("works against an older GRIDGO that lists no pricing options", () => {
    const older = {
      fulfillmentTags: DEFAULT_SURVEY_OPTIONS.fulfillmentTags,
      easeTags: DEFAULT_SURVEY_OPTIONS.easeTags,
      priceFeeling: DEFAULT_SURVEY_OPTIONS.priceFeeling,
    };
    const body = toSubmission({ ...counted, directShopComparison: "cheaper", orderAgainAtPrice: "no" }, "pickup", older);
    expect(body.directShopComparison).toBe("cheaper");
    expect(body.orderAgainAtPrice).toBe("no");
  });
});

describe("choosing", () => {
  it("makes 'not worth it' clear every reason, and any reason clear it", () => {
    expect(toggleWorthTag(["on_time", "print_quality"], NOT_WORTH_IT)).toEqual([NOT_WORTH_IT]);
    expect(toggleWorthTag([NOT_WORTH_IT], "on_time")).toEqual(["on_time"]);
    expect(toggleWorthTag(["on_time"], "easy_ordering")).toEqual(["on_time", "easy_ordering"]);
    expect(toggleWorthTag(["on_time", "easy_ordering"], "on_time")).toEqual(["easy_ordering"]);
    expect(toggleWorthTag([NOT_WORTH_IT], NOT_WORTH_IT)).toEqual([]);
  });

  it("takes a single answer back on a second tap", () => {
    expect(toggleChoice(null, "yes")).toBe("yes");
    expect(toggleChoice("yes", "no")).toBe("no");
    expect(toggleChoice("no", "no")).toBeNull();
  });

  it("offers 'not worth it' apart, and no door delivery on a collected order", () => {
    expect(priceWorthTagsFor(null, "delivery")).not.toContain(NOT_WORTH_IT);
    expect(priceWorthTagsFor(null, "delivery")).toContain("door_delivery");
    expect(priceWorthTagsFor(null, "pickup")).not.toContain("door_delivery");
    expect(offersNotWorthIt(null)).toBe(true);
  });

  it("words every code, and a code this build has never seen", () => {
    expect(directShopLabel("much_more_expensive")).toBe("Much more expensive");
    expect(priceWorthLabel(NOT_WORTH_IT)).toBe("It was not worth it");
    expect(priceWorthLabel("free_coffee")).toBe("Free coffee");
  });
});
