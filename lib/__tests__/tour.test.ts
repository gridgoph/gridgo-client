import {
  arriveAt,
  backStep,
  canGoBack,
  currentStep,
  nextLabel,
  nextStep,
  placeCard,
  shouldAutoStart,
  skipTour,
  startTour,
  stepPosition,
  TOUR_LENGTH,
  TOUR_STEPS,
  visibleStep,
  type TourProgress,
} from "@/lib/tour";

const at = (id: string): TourProgress => ({
  status: "active",
  step: TOUR_STEPS.findIndex((step) => step.id === id),
});

describe("the steps", () => {
  it("walk the order flow as it exists, Home to checkout", () => {
    expect(TOUR_STEPS.map((step) => step.screen)).toEqual([
      "home",
      "home",
      "pick",
      "when",
      "match",
      "listing",
      "artwork",
      "checkout",
    ]);
  });

  it("keep every instruction short", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeLessThanOrEqual(32);
      expect(step.body.length).toBeLessThanOrEqual(140);
    }
  });
});

describe("starting", () => {
  it("starts on its own once, for a first-time client with no tour on record", () => {
    expect(shouldAutoStart(undefined, true)).toBe(true);
    expect(shouldAutoStart(undefined, false)).toBe(false);
  });

  it("never starts on its own again, finished or skipped", () => {
    expect(shouldAutoStart({ status: "done" }, true)).toBe(false);
    expect(shouldAutoStart(startTour(), true)).toBe(false);
  });

  it("starts at the first step", () => {
    expect(currentStep(startTour())?.id).toBe("home.search");
  });
});

describe("next", () => {
  it("moves one step at a time and ends after the last", () => {
    let progress = startTour();
    const seen: string[] = [];
    while (progress.status === "active") {
      seen.push(currentStep(progress)!.id);
      progress = nextStep(progress);
    }
    expect(seen).toEqual(TOUR_STEPS.map((step) => step.id));
    expect(progress).toEqual({ status: "done" });
  });

  it("says Next within a screen, Got it before another screen, Done at the end", () => {
    expect(nextLabel(at("home.search"))).toBe("Next");
    expect(nextLabel(at("home.categories"))).toBe("Got it");
    expect(nextLabel(at("when"))).toBe("Got it");
    expect(nextLabel(at("checkout"))).toBe("Done");
  });

  it("leaves a finished tour finished", () => {
    expect(nextStep({ status: "done" })).toEqual({ status: "done" });
  });
});

describe("back", () => {
  it("steps back within the screen the client is on", () => {
    expect(canGoBack(at("home.categories"))).toBe(true);
    expect(backStep(at("home.categories"))).toEqual(at("home.search"));
  });

  it("never reaches back to a step on another screen, because the tour does not navigate", () => {
    expect(canGoBack(at("home.search"))).toBe(false);
    expect(canGoBack(at("pick"))).toBe(false);
    expect(backStep(at("when"))).toEqual(at("when"));
  });
});

describe("skip", () => {
  it("ends the tour from any step", () => {
    for (const step of TOUR_STEPS) {
      expect(skipTour()).toEqual({ status: "done" });
      expect(visibleStep(skipTour(), step.screen)).toBeNull();
    }
  });
});

describe("where a step shows", () => {
  it("only on its own screen", () => {
    expect(visibleStep(at("when"), "when")?.id).toBe("when");
    expect(visibleStep(at("when"), "home")).toBeNull();
    expect(visibleStep(at("when"), null)).toBeNull();
    expect(visibleStep(undefined, "home")).toBeNull();
  });

  it("waits for the client to reach a later screen rather than taking them there", () => {
    const progress = nextStep(at("home.categories"));
    expect(currentStep(progress)?.screen).toBe("pick");
    expect(visibleStep(progress, "home")).toBeNull();
    expect(visibleStep(progress, "pick")?.id).toBe("pick");
  });

  it("moves up to meet a client who tapped ahead", () => {
    expect(arriveAt(at("home.search"), "when")).toEqual(at("when"));
    expect(arriveAt(at("home.search"), "pick")).toEqual(at("pick"));
  });

  it("stays quiet on a screen it has already passed", () => {
    expect(arriveAt(at("artwork"), "home")).toEqual(at("artwork"));
    expect(visibleStep(arriveAt(at("artwork"), "home"), "home")).toBeNull();
  });

  it("does not come back to life when a finished tour's screens are visited", () => {
    expect(arriveAt({ status: "done" }, "checkout")).toEqual({ status: "done" });
  });
});

it("reports its position for the dots", () => {
  expect(stepPosition(at("pick"))).toEqual({ index: 2, count: TOUR_LENGTH });
});

describe("placing the card", () => {
  const base = { cardHeight: 200, windowHeight: 800, insetTop: 40, insetBottom: 20 };

  it("goes under the lit control when it fits", () => {
    expect(placeCard({ ...base, target: { x: 16, y: 100, width: 300, height: 50 } })).toEqual({
      top: 166,
      side: "below",
    });
  });

  it("goes over a control near the bottom", () => {
    expect(placeCard({ ...base, target: { x: 0, y: 650, width: 390, height: 120 } })).toEqual({
      top: 434,
      side: "above",
    });
  });

  it("pins to the bottom when the control fills the screen, or there is none", () => {
    const pinned = { top: 564, side: "pinned" };
    expect(placeCard({ ...base, target: { x: 0, y: 100, width: 390, height: 600 } })).toEqual(pinned);
    expect(placeCard({ ...base, target: null })).toEqual(pinned);
  });
});
