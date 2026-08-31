import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Client onboarding uses the same PNG pager as Supplier and Rider:
 * picture on the page, copy under it — not a short text band under SVG art.
 */
describe("onboarding layout contract", () => {
  const source = readFileSync(join(__dirname, "../../app/onboarding.tsx"), "utf8");

  it("pages full-height slides with the picture on the page", () => {
    expect(source).toContain("OnboardingMark");
    expect(source).toMatch(/horizontal\s*\n\s*pagingEnabled/);
    expect(source).toContain("estimatePagerHeight");
    expect(source).not.toContain("StyleSheet.absoluteFillObject");
    expect(source).not.toContain("translateX: -delta * width * 0.4");
  });

  it("exits through the explicit returnTo map, not history alone", () => {
    expect(source).toContain("resolveOnboardingDismissTarget");
    expect(source).toContain("returnTo");
  });
});
