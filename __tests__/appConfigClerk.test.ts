import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ConfigContext, ExpoConfig } from "expo/config";

import appConfig, { clerkPublishableKey } from "../app.config";

const root = join(__dirname, "..");
const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as {
  expo: Partial<ExpoConfig>;
};

function context(config: Partial<ExpoConfig>): ConfigContext {
  return { projectRoot: root, staticConfigPath: null, packageJsonPath: null, config };
}

describe("Clerk Expo configuration", () => {
  const original = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = original;
  });

  it("accepts only a public Clerk key", () => {
    expect(clerkPublishableKey(" pk_test_public ")).toBe("pk_test_public");
    expect(() => clerkPublishableKey("sk_test_secret")).toThrow(/publishable/i);
  });

  it("puts the build-time publishable key in Expo extra", () => {
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_public";
    const resolved = appConfig(context(appJson.expo));

    expect(resolved.extra).toMatchObject({ clerkPublishableKey: "pk_test_public" });
    expect(resolved.plugins).toEqual(
      expect.arrayContaining(["@clerk/expo", "expo-secure-store"]),
    );
  });
});
