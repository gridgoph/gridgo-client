import { Platform } from "react-native";

import { PushedStackHeader } from "@/components/PushedStackHeader";
import { pushedScreenOptions } from "@/lib/navigationHeaders";

describe("pushedScreenOptions on Android", () => {
  it("uses the one-inset header so the status bar is not padded twice", () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      get: () => "android",
    });
    try {
      expect(pushedScreenOptions("Sign in").header).toBe(PushedStackHeader);
      expect(pushedScreenOptions("New request").statusBarTranslucent).toBe(true);
    } finally {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        get: () => original,
      });
    }
  });
});
