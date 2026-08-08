import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression lock for the full-height swipe surface.
 *
 * The captain bug was a short text-only pager under a non-interactive art
 * stack. The pager must fill the content area (absolute fill), and art must
 * stay outside the pager with pointerEvents none so parallax survives.
 */
describe("onboarding layout contract", () => {
  const source = readFileSync(join(__dirname, "../../app/onboarding.tsx"), "utf8");

  it("uses a full-height horizontal pager over the content area", () => {
    expect(source).toContain("StyleSheet.absoluteFillObject");
    expect(source).toMatch(/horizontal\s*\n\s*pagingEnabled/);
    expect(source).toContain('contentContainerStyle={{ height: "100%" }}');
    expect(source).toContain('height: "100%"');
    // The short text-band-only pager is the bug; do not reintroduce it.
    expect(source).not.toMatch(/style=\{\{\s*flexGrow:\s*0\s*\}\}/);
  });

  it("keeps illustrations outside the pager for parallax drift", () => {
    expect(source).toContain("transform: [{ translateX: -delta * width * 0.4 }]");
    expect(source).toContain("pointerEvents=\"none\"");
    expect(source).toContain("useReducedMotion");
  });

  it("exits through the explicit returnTo map, not history alone", () => {
    expect(source).toContain("resolveOnboardingDismissTarget");
    expect(source).toContain("returnTo");
  });
});
