import { Platform } from "react-native";

import {
  androidEdgeToEdgeHeaderOptions,
  pushedScreenOptions,
} from "@/lib/navigationHeaders";

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

  it("tells the native stack the status bar is already over the header", () => {
    // Android edge-to-edge: leaving this unset lets native-stack infer the
    // top inset from safe-area *and* pad the toolbar, so the title sits under
    // an empty band the height of the clock. The boolean is the one flag
    // Expo 57's native stack still honours for that.
    expect(androidEdgeToEdgeHeaderOptions.statusBarTranslucent).toBe(true);
    expect(pushedScreenOptions("Order").statusBarTranslucent).toBe(true);
  });

  it("uses the one-inset header on Android and the native header on iOS", () => {
    const options = pushedScreenOptions("Order");
    if (Platform.OS === "android") {
      expect(options.header).toBeDefined();
    } else {
      expect(options.header).toBeUndefined();
    }
  });
});
