import type { ExpressGuide } from "@/lib/api";
import {
  backGuide,
  canGoBackGuide,
  GUIDE_LENGTH,
  GUIDE_STEPS,
  guideStep,
  HOW_TO_ORDER_HREF,
  nextGuide,
  shouldOpenMissionPopup,
  showsHowToOrderBar,
  startOrderAction,
} from "@/lib/expressGuide";
import { foundingTesterView, type FoundingTesterView } from "@/lib/foundingTester";

const MISSIONS = foundingTesterView({
  foundingTester: {
    eligible: true,
    label: null,
    awardedAt: null,
    missions: { added: false, placed: false, tracked: false, received: false, rated: false },
    completedCount: 0,
    rewardStatus: "pending",
    reward: null,
  },
}) as FoundingTesterView;

function flags(patch: Partial<ExpressGuide> = {}): ExpressGuide {
  return { missions: { added: false }, popupLastShownDate: null, guideSeen: false, guideCompleted: false, showPopup: true, ...patch };
}

const due = { guide: flags(), view: MISSIONS, openedThisLaunch: false, guideRunning: false };

describe("the mission popup", () => {
  it("opens when GRIDGO says today's is due, over an eligible tester's steps", () => {
    expect(shouldOpenMissionPopup(due)).toBe(true);
  });

  it("waits a day once shown: GRIDGO's showPopup is false for the rest of the Manila day", () => {
    expect(shouldOpenMissionPopup({ ...due, guide: flags({ showPopup: false, popupLastShownDate: "2026-11-19" }) })).toBe(false);
  });

  it("stops for good once step one is done", () => {
    expect(shouldOpenMissionPopup({ ...due, guide: flags({ missions: { added: true } }) })).toBe(false);
  });

  it("opens at most once a launch, never while the guide runs, never before the flags are read", () => {
    expect(shouldOpenMissionPopup({ ...due, openedThisLaunch: true })).toBe(false);
    expect(shouldOpenMissionPopup({ ...due, guideRunning: true })).toBe(false);
    expect(shouldOpenMissionPopup({ ...due, guide: null })).toBe(false);
  });

  it("never opens for an account without the mission steps", () => {
    expect(shouldOpenMissionPopup({ ...due, view: null })).toBe(false);
  });

  it("offers How to order in its tip bar until the guide is completed", () => {
    expect(showsHowToOrderBar(flags())).toBe(true);
    expect(showsHowToOrderBar(flags({ guideSeen: true }))).toBe(true);
    expect(showsHowToOrderBar(flags({ guideSeen: true, guideCompleted: true }))).toBe(false);
    expect(showsHowToOrderBar(null)).toBe(false);
  });
});

describe("the mission's step one button", () => {
  it("opens the guide until it is completed, then Express Files", () => {
    expect(startOrderAction(false)).toEqual({ label: "How to order", href: HOW_TO_ORDER_HREF });
    expect(startOrderAction(true)).toEqual({ label: "Open Express", href: "/express" });
    expect(startOrderAction(undefined).href).toBe("/express");
  });
});

describe("the guide's steps", () => {
  it("walks Home, Upload, Preview, the shop row and the pickup code, in that order", () => {
    expect(GUIDE_STEPS.map((step) => step.id)).toEqual([
      "home.express",
      "express.upload",
      "express.preview",
      "express.shop",
      "express.pickup",
    ]);
    expect(GUIDE_LENGTH).toBe(5);
  });

  it("goes on to the end card after the fifth tip, and back from it to the fifth", () => {
    let progress = { step: 0 } as ReturnType<typeof nextGuide>;
    for (let i = 0; i < GUIDE_LENGTH; i++) progress = nextGuide(progress);
    expect(progress).toEqual({ step: "end" });
    expect(guideStep(progress)).toBeNull();
    expect(nextGuide(progress)).toEqual({ step: "end" });
    expect(backGuide(progress)).toEqual({ step: GUIDE_LENGTH - 1 });
  });

  it("has no Back on the first tip", () => {
    expect(canGoBackGuide({ step: 0 })).toBe(false);
    expect(canGoBackGuide({ step: 1 })).toBe(true);
    expect(canGoBackGuide({ step: "end" })).toBe(true);
    expect(backGuide({ step: 0 })).toEqual({ step: 0 });
  });
});
