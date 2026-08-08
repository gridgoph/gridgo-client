import { resolveOnboardingDismissTarget } from "@/lib/onboardingExit";

describe("resolveOnboardingDismissTarget", () => {
  it("returns to Settings when replayed from Settings (finish or skip)", () => {
    expect(resolveOnboardingDismissTarget("settings", true)).toEqual({
      type: "replace",
      href: "/settings",
    });
    expect(resolveOnboardingDismissTarget("settings", false)).toEqual({
      type: "replace",
      href: "/settings",
    });
  });

  it("accepts Expo Router array params for returnTo", () => {
    expect(resolveOnboardingDismissTarget(["settings"], false)).toEqual({
      type: "replace",
      href: "/settings",
    });
  });

  it("goes back when launched with a previous screen and no returnTo", () => {
    expect(resolveOnboardingDismissTarget(undefined, true)).toEqual({ type: "back" });
  });

  it("replaces to the launcher when there is no history and no returnTo", () => {
    expect(resolveOnboardingDismissTarget(undefined, false)).toEqual({
      type: "replace",
      href: "/",
    });
  });

  it("ignores unknown returnTo values and falls back to history / launcher", () => {
    expect(resolveOnboardingDismissTarget("orders", true)).toEqual({ type: "back" });
    expect(resolveOnboardingDismissTarget("orders", false)).toEqual({
      type: "replace",
      href: "/",
    });
  });
});
