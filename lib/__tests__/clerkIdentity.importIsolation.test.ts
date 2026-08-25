import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `expo-image-picker` is a native module. A USB development binary built
 * before it was added throws at **import time** (`Cannot find native module
 * 'ExponentImagePicker'`), not when the picker is opened. Your details used
 * to crash on open because `account-details` imported `changeClientPhoto`
 * from `clerkIdentity`, which statically imported the picker.
 *
 * These tests pin the module graph, not a Jest mock of a working picker: a
 * global mock would hide the real crash.
 */
const MISSING_NATIVE = "Cannot find native module 'ExponentImagePicker'";

describe("expo-image-picker must not load at import time", () => {
  it("clerkIdentity has no static import of the native module", () => {
    const source = readFileSync(join(__dirname, "../clerkIdentity.ts"), "utf8");
    expect(source).not.toMatch(/import\s+[^;]*from\s+["']expo-image-picker["']/);
  });

  it("Your details and the sign-in steps have no static import of the native module", () => {
    for (const relative of [
      "../../app/account-details.tsx",
      "../../app/change-email.tsx",
      "../../app/change-password.tsx",
    ]) {
      const source = readFileSync(join(__dirname, relative), "utf8");
      expect(source).not.toContain("expo-image-picker");
    }
  });

  it("importing clerkIdentity does not throw when ImagePicker is absent", () => {
    jest.isolateModules(() => {
      jest.doMock("expo-image-picker", () => {
        throw new Error(MISSING_NATIVE);
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      expect(() => require("@/lib/clerkIdentity")).not.toThrow();
    });
  });

  it("tapping change-photo asks for a rebuilt app rather than crashing", async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock("expo-image-picker", () => {
        throw new Error(MISSING_NATIVE);
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { changeClientPhoto, PORTRAIT_NEEDS_REBUILD } = require("@/lib/clerkIdentity") as typeof import("@/lib/clerkIdentity");
      const outcome = await changeClientPhoto({
        setProfileImage: jest.fn(),
      });
      expect(outcome).toEqual({ status: "failed", message: PORTRAIT_NEEDS_REBUILD });
    });
  });
});
