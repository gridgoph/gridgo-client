import { images } from "@/constants/images";
import { onboardingSlides } from "@/data/onboarding";

describe("images", () => {
  it("keeps the bundled receiving QR", () => {
    expect(images.gcashQr).toBeDefined();
  });

  it("registers a picture for every onboarding beat", () => {
    for (const slide of onboardingSlides) {
      expect(images.onboarding[slide.art]).toBeDefined();
    }
  });
});
