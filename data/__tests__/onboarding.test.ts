import { onboardingSteps } from "@/data/onboarding";
import { images } from "@/constants/images";

/**
 * gridgo-client#159: features first, the notification ask straight after the
 * tracking preview, the ranking last, and nothing that asks where the client is.
 */
describe("client onboarding sequence", () => {
  it("runs tracking, notifications, payment, checks, scheduling, then the ranking", () => {
    expect(onboardingSteps.map((step) => step.id)).toEqual([
      "tracking",
      "notifications",
      "escrow",
      "quality",
      "scheduling",
      "ranking",
    ]);
  });

  it("asks for notifications once, immediately after the tracking preview", () => {
    const kinds = onboardingSteps.map((step) => step.kind);
    expect(kinds.filter((kind) => kind === "notifications")).toHaveLength(1);
    const tracking = onboardingSteps.findIndex((step) => step.id === "tracking");
    expect(onboardingSteps[tracking + 1].kind).toBe("notifications");
  });

  it("opens on features and ends on the ranking", () => {
    expect(onboardingSteps[0].kind).toBe("feature");
    expect(onboardingSteps[onboardingSteps.length - 1].kind).toBe("ranking");
    expect(onboardingSteps.filter((step) => step.kind === "feature")).toHaveLength(4);
  });

  it("has no location or address step, and no copy asking for one", () => {
    const kinds = onboardingSteps.map((step) => step.kind as string);
    expect(kinds).not.toContain("location");
    expect(kinds).not.toContain("address");
    for (const step of onboardingSteps) {
      expect(step.title).not.toMatch(/location|address|where are you/i);
    }
  });

  it("uses artwork the app already ships, never a new illustration", () => {
    for (const step of onboardingSteps) {
      if (step.kind !== "feature" || step.visual.type !== "art") continue;
      expect(Object.keys(images.onboarding)).toContain(step.visual.art);
    }
  });

  it("promises no ETA on the tracking page — GRIDGO publishes none", () => {
    const tracking = onboardingSteps.find((step) => step.id === "tracking");
    expect(tracking?.body).not.toMatch(/\bETA\b|arrival time/i);
  });
});
