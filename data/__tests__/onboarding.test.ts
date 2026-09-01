import { onboardingSlides } from "@/data/onboarding";

describe("client onboarding slides", () => {
  it("has three beats with step labels and CTAs", () => {
    expect(onboardingSlides).toHaveLength(3);
    expect(onboardingSlides.map((s) => s.step)).toEqual(["01 / 03", "02 / 03", "03 / 03"]);
    expect(onboardingSlides[0].cta).toBe("Next");
    expect(onboardingSlides[1].cta).toBe("Next");
    expect(onboardingSlides[2].cta).toBe("Get Started");
  });

  it("uses the captain-picked client pictures", () => {
    expect(onboardingSlides.map((s) => s.art)).toEqual(["order", "approve", "track"]);
  });

  it("does not carry the old scene-SVG art keys", () => {
    const arts = onboardingSlides.map((s) => s.art);
    expect(arts).not.toContain("scooter");
    expect(arts).not.toContain("proof");
    expect(arts).not.toContain("workstation");
  });
});
