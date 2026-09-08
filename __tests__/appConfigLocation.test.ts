import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("expo-location is wired for the drop-off pin", () => {
  const root = join(__dirname, "..");
  const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as {
    expo: {
      plugins?: unknown[];
      ios?: { infoPlist?: { NSLocationWhenInUseUsageDescription?: string } };
      android?: { permissions?: string[] };
    };
  };

  it("asks only when-in-use, with copy that names the drop-off", () => {
    const plugin = (appJson.expo.plugins ?? []).find(
      (entry) => Array.isArray(entry) && entry[0] === "expo-location",
    ) as [string, { locationWhenInUsePermission?: string }] | undefined;
    expect(plugin?.[1]?.locationWhenInUsePermission).toMatch(/drop-off/i);
    expect(appJson.expo.ios?.infoPlist?.NSLocationWhenInUseUsageDescription).toMatch(/drop-off/i);
    expect(appJson.expo.android?.permissions).toEqual(
      expect.arrayContaining(["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"]),
    );
  });
});
