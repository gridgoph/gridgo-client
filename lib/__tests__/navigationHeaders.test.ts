import { pushedScreenOptions } from "@/lib/navigationHeaders";

describe("pushedScreenOptions", () => {
  it("shows the bare chevron the captain asked for", () => {
    expect(pushedScreenOptions("Order").headerBackButtonDisplayMode).toBe("minimal");
  });

  it("never lets the previous screen's title reach the back control", () => {
    // This is what "minimal" is protecting, not just a style choice: iOS
    // otherwise writes the previous title there, which is the filesystem name
    // `(tabs)` from a tab, and a lie from any of the several tabs an order can
    // be opened from. Setting an explicit label would work too, and the
    // captain has ruled against one — so the mode has to stay.
    const options = pushedScreenOptions("Order");
    expect(options.headerBackButtonDisplayMode).toBe("minimal");
    expect(options).not.toHaveProperty("headerBackTitle");
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
