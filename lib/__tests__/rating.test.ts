import { ApiError, type Order } from "@/lib/api";
import {
  NO_SCORES,
  RATED_FACTORS,
  canRate,
  factorBlurb,
  factorLabel,
  firstUnrated,
  isAlreadyRated,
  isComplete,
  ratingErrorMessage,
  starWord,
  toRequest,
} from "@/lib/rating";

const order = (overrides: Partial<Order> = {}) =>
  ({ state: "completed", rated: false, ...overrides }) as Order;

describe("what a client is asked to rate", () => {
  it("asks about quality, speed and value — and never distance", () => {
    // GRIDGO chose the shop and the client never saw where it was. Asking
    // somebody to rate a decision they did not make and cannot see is noise.
    expect(RATED_FACTORS).toEqual(["quality", "speed", "value"]);
    expect(RATED_FACTORS).not.toContain("distance");
  });

  it("describes each one as this job rather than as a reputation", () => {
    expect(factorBlurb("speed")).toContain("promised");
    expect(factorLabel("value")).toBe("Value");
  });

  it("says in words what a number of stars means", () => {
    // Colour and shape alone are not a rating anyone can read back.
    expect(starWord(3)).toBe("About what I expected");
    expect(starWord(5)).toBe("Excellent");
    expect(starWord(0)).toBe("Not rated yet");
  });
});

describe("when an order can be rated", () => {
  it("takes a rating once the job is finished", () => {
    expect(canRate(order({ state: "completed" }))).toBe(true);
    expect(canRate(order({ state: "payout_released" }))).toBe(true);
  });

  it("refuses one on a job still running", () => {
    // The platform refuses it too. A rating on an open job is a bargaining
    // chip, and an app that offered it would walk the client into a refusal.
    expect(canRate(order({ state: "production" }))).toBe(false);
    expect(canRate(order({ state: "issue_window_open" }))).toBe(false);
    expect(canRate(order({ state: "out_for_delivery" }))).toBe(false);
  });

  it("asks once", () => {
    expect(canRate(order({ rated: true }))).toBe(false);
    expect(canRate(null)).toBe(false);
  });
});

describe("sending it", () => {
  it("needs all three before it can be sent", () => {
    expect(isComplete(NO_SCORES)).toBe(false);
    expect(isComplete({ quality: 5, speed: 4, value: 0 })).toBe(false);
    expect(isComplete({ quality: 5, speed: 4, value: 3 })).toBe(true);
  });

  it("names the first thing still unanswered", () => {
    expect(firstUnrated({ quality: 5, speed: 0, value: 0 })).toBe("speed");
    expect(firstUnrated({ quality: 5, speed: 4, value: 3 })).toBeNull();
  });

  it("translates into the platform's own field names", () => {
    expect(toRequest({ quality: 5, speed: 3, value: 4 }, "  ")).toEqual({
      qualityStars: 5,
      speedStars: 3,
      valueStars: 4,
    });
  });

  it("sends a comment only when there is one", () => {
    // An empty string is not a comment, and sending one puts a blank note on
    // a shop's record.
    expect(toRequest({ quality: 5, speed: 5, value: 5 }, " Lovely work ")).toEqual({
      qualityStars: 5,
      speedStars: 5,
      valueStars: 5,
      comment: "Lovely work",
    });
  });
});

describe("when it will not save", () => {
  const refusal = (code: string, status = 409) => new ApiError(status, { error: code });

  it("treats a second rating as done rather than failed", () => {
    // Another device, or an earlier tap, got there first. Nothing the client
    // did wrong and nothing left for them to do.
    expect(isAlreadyRated(refusal("already_rated"))).toBe(true);
    expect(ratingErrorMessage(refusal("already_rated"))).toContain("already been rated");
  });

  it("explains an unfinished order in the client's terms", () => {
    expect(ratingErrorMessage(refusal("order_not_complete"))).toContain("not finished yet");
  });

  it("never puts a platform code on screen", () => {
    for (const code of ["already_rated", "order_not_complete", "forbidden", "invalid_rating", "boom"]) {
      expect(ratingErrorMessage(refusal(code))).not.toMatch(/_/);
    }
    expect(ratingErrorMessage(new Error("network"))).not.toMatch(/_/);
  });

  it("does not mistake an ordinary failure for a completed rating", () => {
    expect(isAlreadyRated(refusal("forbidden", 403))).toBe(false);
    expect(isAlreadyRated(new Error("network"))).toBe(false);
  });
});
