import { onboardingSteps } from "@/data/onboarding";
import {
  onboardingPushButtons,
  onboardingPushMode,
  onboardingRankingButton,
  onboardingSkip,
  onboardingStepLabel,
  rankingIndex,
} from "@/lib/onboardingFlow";

describe("onboardingStepLabel", () => {
  it("states position in text", () => {
    expect(onboardingStepLabel(0, 6)).toBe("01 / 06");
    expect(onboardingStepLabel(5, 6)).toBe("06 / 06");
  });
});

describe("onboardingSkip", () => {
  const ranking = rankingIndex(onboardingSteps);

  it("jumps an unranked client to the ranking, never out of onboarding", () => {
    for (let index = 0; index < ranking; index += 1) {
      expect(onboardingSkip(onboardingSteps, index, false)).toEqual({
        type: "to_ranking",
        index: ranking,
        label: "Skip to your ranking",
      });
    }
  });

  it("lets a client who has ranked (a replay) leave", () => {
    expect(onboardingSkip(onboardingSteps, 0, true)).toEqual({
      type: "leave",
      label: "Skip onboarding",
    });
  });

  it("offers nothing on the ranking page itself", () => {
    expect(onboardingSkip(onboardingSteps, ranking, false)).toBeNull();
    expect(onboardingSkip(onboardingSteps, ranking, true)).toBeNull();
  });
});

describe("the notification page", () => {
  it("asks only where the phone can still be asked", () => {
    expect(onboardingPushMode({ supported: true, permission: "undetermined" })).toBe("ask");
    expect(onboardingPushMode({ supported: true, permission: "unknown" })).toBe("ask");
    expect(onboardingPushMode({ supported: true, permission: "granted" })).toBe("on");
    expect(onboardingPushMode({ supported: true, permission: "blocked" })).toBe("blocked");
    expect(onboardingPushMode({ supported: false, permission: "undetermined" })).toBe(
      "unavailable",
    );
  });

  it("raises the OS dialog only from the ask's own button, with Not now beside it", () => {
    expect(onboardingPushButtons("ask")).toMatchObject({
      primary: { label: "Turn on notifications", action: "enable" },
      later: "Not now",
    });
    expect(onboardingPushButtons("blocked").primary.action).toBe("open_settings");
    expect(onboardingPushButtons("on")).toMatchObject({
      primary: { action: "next" },
      later: null,
    });
    expect(onboardingPushButtons("unavailable")).toMatchObject({
      primary: { action: "next" },
      later: null,
    });
  });
});

describe("the ranking page's button", () => {
  const base = { complete: false, saving: false, upToDate: false, failed: false };

  it("stays disabled until all four are placed", () => {
    expect(onboardingRankingButton(base)).toEqual({
      label: "Save and continue",
      action: "none",
      disabled: true,
    });
  });

  it("saves a complete order", () => {
    expect(onboardingRankingButton({ ...base, complete: true })).toEqual({
      label: "Save and continue",
      action: "save",
      disabled: false,
    });
  });

  it("says Saving… while the request is out, and Try again after a failure", () => {
    expect(onboardingRankingButton({ ...base, complete: true, saving: true })).toMatchObject({
      label: "Saving…",
      disabled: true,
    });
    expect(onboardingRankingButton({ ...base, complete: true, failed: true })).toMatchObject({
      label: "Try again",
      action: "save",
    });
  });

  it("only leaves once the order on screen is the one GRIDGO holds", () => {
    expect(onboardingRankingButton({ ...base, complete: true, upToDate: true })).toEqual({
      label: "Done",
      action: "finish",
      disabled: false,
    });
  });
});
