import { images } from "@/constants/images";
import { onboardingSteps } from "@/data/onboarding";

describe("images", () => {
  it("keeps the bundled receiving QR", () => {
    expect(images.gcashQr).toBeDefined();
  });

  it("registers a picture for every onboarding page that uses artwork", () => {
    for (const step of onboardingSteps) {
      if (step.kind !== "feature" || step.visual.type !== "art") continue;
      expect(images.onboarding[step.visual.art]).toBeDefined();
    }
  });
});
