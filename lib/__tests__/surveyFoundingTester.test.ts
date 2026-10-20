import {
  isFoundingTesterSurvey,
  issuedSurveyReward,
  rewardBadge,
  rewardMeterLine,
  rewardOffer,
  surveyNotificationCallout,
  surveyReward,
  surveyThanks,
} from "@/lib/survey";
import { sentSurvey, survey } from "@/test/surveyFixtures";
import { voucher } from "@/test/voucherFixtures";

/**
 * A Founding Tester survey (`rewardProgram: "founding_tester"`, gridgo-api
 * VOUCHERS_API.md) earns no survey voucher: its voucher is the one for all
 * five steps, which GRIDGO's budget can hold. So no amount is named before
 * issue, and the issued wallet item's `valueMinor` is drawn after.
 */

const tester = survey({ rewardProgram: "founding_tester" });

describe("a Founding Tester survey", () => {
  it("is told apart by GRIDGO's rewardProgram, and an older API's card is the survey programme", () => {
    expect(isFoundingTesterSurvey(tester)).toBe(true);
    expect(isFoundingTesterSurvey(survey({ rewardProgram: "survey" }))).toBe(false);
    expect(isFoundingTesterSurvey(survey())).toBe(false);
  });

  it("promises no fixed amount on the card, the screen or the meter", () => {
    expect(surveyReward(tester)).toEqual({ kind: "founding_tester" });
    const words = [rewardBadge(tester), rewardOffer(tester), rewardMeterLine(1, surveyReward(tester)), rewardMeterLine(3, surveyReward(tester))];
    for (const line of words) expect(line).not.toMatch(/₱|\d+\.\d{2}/);
    expect(rewardBadge(tester)).toBe("Counts as your Founding Tester survey step. Your voucher comes with all five steps.");
    expect(rewardMeterLine(1, surveyReward(tester))).toBe("1 of 3 answered. 2 more to finish your Founding Tester survey step.");
    expect(rewardMeterLine(3, surveyReward(tester))).toBe("Ready to send. It finishes your Founding Tester survey step.");
  });

  it("promises no fixed amount in the inbox", () => {
    const callout = surveyNotificationCallout(new Date().toISOString(), true, Date.now(), "founding_tester");
    expect(callout).toEqual({ title: "Your Founding Tester survey step", detail: "Your voucher comes with all five steps." });
  });

  it("offers nothing once GRIDGO says it cannot earn (the label already earned)", () => {
    const earned = survey({ rewardProgram: "founding_tester", rewardEligible: false });
    expect(rewardBadge(earned)).toBeNull();
    expect(rewardMeterLine(3, surveyReward(earned))).toBe("Ready to send.");
  });

  it("draws the issued wallet voucher's own amount once all five steps earned it", () => {
    const issued = sentSurvey({ rewardProgram: "founding_tester", rewardStatus: "founding_tester", reward: voucher({ valueMinor: 2500 }) });
    expect(issuedSurveyReward(issued)?.valueMinor).toBe(2500);
    expect(surveyThanks(issued)).toMatchObject({ rewardIssued: true, body: expect.stringMatching(/^Your ₱25.00 voucher is in your wallet/) });
  });

  it("says the voucher is still to come when the answers are in but no voucher is issued (budget pause, steps left)", () => {
    const waiting = sentSurvey({ rewardProgram: "founding_tester", rewardStatus: "founding_tester", reward: null });
    expect(issuedSurveyReward(waiting)).toBeNull();
    const thanks = surveyThanks(waiting);
    expect(thanks.rewardIssued).toBe(false);
    expect(thanks.body).toBe("Your answers reached GRIDGO. Your Founding Tester voucher comes once GRIDGO counts all five steps.");
    expect(thanks.body).not.toMatch(/₱/);
  });
});

describe("the survey programme keeps its contract's wording", () => {
  it("names its fixed voucher on the card, the screen, the meter and the inbox", () => {
    const card = survey({ rewardProgram: "survey" });
    expect(rewardBadge(card)).toBe("₱15.00 voucher for the first three answers");
    expect(rewardOffer(card)).toBe("Answer the first three questions and GRIDGO adds a ₱15.00 voucher to your wallet.");
    expect(rewardMeterLine(2, surveyReward(card))).toBe("2 of 3 answered. One more for your ₱15.00 voucher.");
    expect(surveyNotificationCallout(new Date().toISOString(), true, Date.now(), "survey")?.title).toBe(
      "₱15.00 voucher for the first three answers",
    );
  });
});
