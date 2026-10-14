import { ApiError, type OrderSurvey } from "@/lib/api";
import {
  DEFAULT_SURVEY_OPTIONS,
  EMPTY_SURVEY_DRAFT,
  canHaveSurvey,
  canSend,
  missingLine,
  noRewardLine,
  parsePesos,
  recommendWord,
  requiredAnswered,
  surveyErrorMessage,
  surveyNotificationCallout,
  surveyRoute,
  surveyThanks,
  surveyView,
  tagLabel,
  toSubmission,
  toggleTag,
  type SurveyDraft,
} from "@/lib/survey";
import { groupedCode } from "@/lib/vouchers";

const NOW = Date.parse("2026-10-15T08:00:00.000Z");

function survey(patch: Partial<OrderSurvey> = {}): OrderSurvey {
  return {
    orderId: "ord_1",
    status: "open",
    fulfillmentKind: "delivery",
    openedAt: "2026-10-14T08:00:00.000Z",
    expiresAt: "2026-10-21T08:00:00.000Z",
    dismissedAt: null,
    submittedAt: null,
    answers: null,
    needsFollowUp: false,
    rewardStatus: null,
    reward: null,
    rewardEligible: true,
    nextRewardAt: null,
    reportProblem: null,
    ...patch,
  };
}

const answered: SurveyDraft = { ...EMPTY_SURVEY_DRAFT, fulfillmentStars: 4, easeStars: 5, priceFeeling: 3 };

describe("which orders can have a survey", () => {
  it("is only a handed-over order", () => {
    expect(canHaveSurvey("delivered")).toBe(true);
    expect(canHaveSurvey("issue_window_open")).toBe(true);
    expect(canHaveSurvey("completed")).toBe(true);
    expect(canHaveSurvey("payout_released")).toBe(true);
    // Ready at the hub, or out with a rider, is not a hand-over yet.
    expect(canHaveSurvey("awaiting_collection")).toBe(false);
    expect(canHaveSurvey("out_for_delivery")).toBe(false);
    expect(canHaveSurvey(null)).toBe(false);
  });
});

describe("where a survey stands", () => {
  it("offers an open survey, keeps a skipped one reachable and thanks for a sent one", () => {
    expect(surveyView(survey(), NOW)?.kind).toBe("invite");
    expect(surveyView(survey({ dismissedAt: "2026-10-14T09:00:00.000Z" }), NOW)?.kind).toBe("skipped");
    expect(surveyView(survey({ status: "submitted", submittedAt: "2026-10-14T09:00:00.000Z" }), NOW)?.kind).toBe("sent");
  });

  it("draws nothing for no survey or one that closed unanswered", () => {
    expect(surveyView(null, NOW)).toBeNull();
    expect(surveyView(survey({ status: "expired" }), NOW)).toBeNull();
  });

  it("closes on GRIDGO's clock even before the next read says so (expiry is exclusive)", () => {
    const open = survey();
    expect(surveyView(open, Date.parse(open.expiresAt) - 1)?.kind).toBe("invite");
    expect(surveyView(open, Date.parse(open.expiresAt))).toBeNull();
  });
});

describe("the three answers that count", () => {
  it("counts fulfilment, ease and price — never the optional ones", () => {
    expect(requiredAnswered(EMPTY_SURVEY_DRAFT)).toBe(0);
    expect(requiredAnswered({ ...EMPTY_SURVEY_DRAFT, qualityStars: 5, recommendScore: 10, improvementNote: "x" })).toBe(0);
    expect(requiredAnswered(answered)).toBe(3);
  });

  it("can be sent with only the three, and a recommendation of zero is an answer", () => {
    expect(canSend(answered)).toBe(true);
    expect(canSend({ ...answered, priceFeeling: 0 })).toBe(false);
    expect(toSubmission({ ...answered, recommendScore: 0 }, "delivery", DEFAULT_SURVEY_OPTIONS).recommendScore).toBe(0);
  });

  it("says which counted question is still missing, in the order's own words", () => {
    expect(missingLine(EMPTY_SURVEY_DRAFT, "pickup")).toBe("Rate the pick-up to continue.");
    expect(missingLine({ ...EMPTY_SURVEY_DRAFT, fulfillmentStars: 2 }, "delivery")).toBe(
      "Rate how easy ordering was to continue.",
    );
    expect(missingLine(answered, "delivery")).toBeNull();
  });
});

describe("the body GRIDGO takes", () => {
  it("sends nulls for unanswered optional questions and trims the note", () => {
    expect(toSubmission({ ...answered, improvementNote: "  " }, "delivery", null)).toEqual({
      fulfillmentStars: 4,
      fulfillmentTags: [],
      easeStars: 5,
      easeTags: [],
      priceFeeling: 3,
      expectedPriceMinor: null,
      qualityStars: null,
      recommendScore: null,
      improvementNote: null,
    });
  });

  it("sends the expected price in centavos", () => {
    expect(toSubmission({ ...answered, expectedPrice: "₱1,250.50" }, "delivery", null).expectedPriceMinor).toBe(125050);
  });

  it("never sends a delivery tag on a pick-up", () => {
    const body = toSubmission(
      { ...answered, fulfillmentTags: ["late", "long_wait"], easeTags: ["easy_checkout"] },
      "pickup",
      DEFAULT_SURVEY_OPTIONS,
    );
    expect(body.fulfillmentTags).toEqual(["long_wait"]);
    expect(body.easeTags).toEqual(["easy_checkout"]);
  });

  it("toggles tags on and off without duplicates", () => {
    expect(toggleTag(["late"], "on_time")).toEqual(["late", "on_time"]);
    expect(toggleTag(["late", "on_time"], "late")).toEqual(["on_time"]);
  });
});

describe("pesos as typed", () => {
  it("reads plain amounts and refuses anything it would have to guess at", () => {
    expect(parsePesos("")).toBeNull();
    expect(parsePesos("450")).toBe(45000);
    expect(parsePesos("1,250.5")).toBe(125050);
    expect(parsePesos("PHP 99.99")).toBe(9999);
    expect(parsePesos("about 500")).toBe("invalid");
    expect(parsePesos("-5")).toBe("invalid");
    expect(parsePesos("1.234")).toBe("invalid");
    expect(canSend({ ...answered, expectedPrice: "abc" })).toBe(false);
  });
});

describe("words", () => {
  it("labels every tag GRIDGO offers, and an unknown one in plain words rather than a code", () => {
    const all = [
      ...DEFAULT_SURVEY_OPTIONS.fulfillmentTags.delivery,
      ...DEFAULT_SURVEY_OPTIONS.fulfillmentTags.pickup,
      ...DEFAULT_SURVEY_OPTIONS.easeTags,
    ];
    for (const code of all) expect(tagLabel(code)).not.toMatch(/_/);
    expect(tagLabel("print_smudged")).toBe("Print smudged");
  });

  it("says what a recommendation score means", () => {
    expect(recommendWord(3)).toBe("3 out of 10, not likely");
    expect(recommendWord(7)).toBe("7 out of 10, maybe");
    expect(recommendWord(10)).toBe("10 out of 10, very likely");
  });

  it("groups a voucher code in fours", () => {
    expect(groupedCode("7AFD123456789ABC")).toBe("7AFD 1234 5678 9ABC");
  });

  it("explains a missing reward instead of leaving it out silently", () => {
    expect(noRewardLine(survey())).toBeNull();
    expect(noRewardLine(survey({ rewardEligible: false, nextRewardAt: "2026-10-18T08:00:00.000Z" }))).toMatch(
      /does not come with a voucher/,
    );
  });
});

describe("thanks", () => {
  it("names the voucher when one came, and is plain about the weekly limit when not", () => {
    const voucher = {
      id: "vch_1",
      campaignId: "vcamp_1",
      name: "Thank you for your order feedback",
      valueMinor: 1500,
      status: "available",
      issuedAt: "2026-10-14T08:05:00.000Z",
      expiresAt: "2026-11-13T08:05:00.000Z",
      secondsRemaining: 100,
      redeemable: true,
      reservation: null,
      fundedBy: "GRIDGO",
      transferable: false as const,
      cashValue: false as const,
      code: "7AFD123456789ABC",
    };
    expect(surveyThanks(survey({ status: "submitted", rewardStatus: "issued", reward: voucher }))).toMatchObject({
      rewardIssued: true,
      body: expect.stringContaining("₱15.00 voucher is in your wallet"),
    });
    expect(surveyThanks(survey({ status: "submitted", rewardStatus: "cooldown" }))).toMatchObject({
      rewardIssued: false,
      body: expect.stringContaining("last 7 days"),
    });
  });
});

describe("refusals", () => {
  it("words a closed survey and bad answers, never the code", () => {
    const closed = new ApiError(409, { error: "survey_closed" });
    expect(surveyErrorMessage(closed, "fallback")).toMatch(/closed/);
    expect(surveyErrorMessage(new ApiError(400, { error: "invalid_survey_tags" }), "fallback")).not.toMatch(/_/);
    expect(surveyErrorMessage(new Error("offline"), "fallback")).toBe("fallback");
  });
});

describe("routes and the inbox", () => {
  it("opens the survey for its order", () => {
    expect(surveyRoute("ord_1")).toBe("/order/survey?orderId=ord_1");
    expect(surveyRoute("ord_1", "order")).toBe("/order/survey?orderId=ord_1&from=order");
  });

  it("stops offering the reward once the invitation is a week old", () => {
    expect(surveyNotificationCallout("2026-10-14T08:00:00.000Z", NOW)?.title).toBe(
      "₱15.00 voucher for the first three answers",
    );
    expect(surveyNotificationCallout("2026-10-01T08:00:00.000Z", NOW)).toBeNull();
  });
});
