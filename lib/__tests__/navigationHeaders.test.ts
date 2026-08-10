import { pushedScreenOptions } from "@/lib/navigationHeaders";

describe("pushedScreenOptions", () => {
  it("labels the back control 'Back' rather than the previous screen", () => {
    // iOS would otherwise write the previous screen's title on the control,
    // which is the filesystem name `(tabs)` from a tab, and a lie from any of
    // the several tabs an order can be opened from.
    expect(pushedScreenOptions("Order").headerBackTitle).toBe("Back");
  });

  it("keeps the label visible", () => {
    // "minimal" hides it. A bare chevron above a screen with its own large
    // heading is what got reported as "not all have Back".
    expect(pushedScreenOptions("Order").headerBackButtonDisplayMode).toBe("default");
  });

  it("never names a route group", () => {
    expect(JSON.stringify(pushedScreenOptions("Order"))).not.toContain("(tabs)");
  });

  it("carries the title into the band", () => {
    expect(pushedScreenOptions("New request").title).toBe("New request");
  });

  it("refuses a blank title", () => {
    // The captain bug: `title: ""` still draws the whole bar, so the client
    // paid a header's height for a chevron and nothing else. TypeScript
    // rejects the empty literal; this covers the whitespace spelling of it.
    expect(() => pushedScreenOptions(" ")).toThrow(/needs a header title/);
  });
});
