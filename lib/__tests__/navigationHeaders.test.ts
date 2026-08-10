import { multiOriginPushedScreenOptions } from "@/lib/navigationHeaders";

describe("multiOriginPushedScreenOptions", () => {
  it("labels the back control 'Back' rather than the previous screen", () => {
    // iOS would otherwise write the previous screen's title on the control,
    // which is the filesystem name `(tabs)` from a tab, and a lie from any of
    // the several tabs an order can be opened from.
    expect(multiOriginPushedScreenOptions.headerBackTitle).toBe("Back");
  });

  it("keeps the label visible", () => {
    // "minimal" hides it. A bare chevron above a screen with its own large
    // heading is what got reported as "not all have Back".
    expect(multiOriginPushedScreenOptions.headerBackButtonDisplayMode).toBe("default");
  });

  it("never names a route group", () => {
    expect(JSON.stringify(multiOriginPushedScreenOptions)).not.toContain("(tabs)");
  });
});
