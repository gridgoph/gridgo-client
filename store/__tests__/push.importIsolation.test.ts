import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Expo Go Android SDK 53 throws when `expo-notifications` is first imported —
 * not when a native method is called. Login used to crash because it imported
 * PushEnableCard → store/push, and the try/wrap around native calls never ran.
 *
 * These tests pin the module graph, not the mock in jest.setup.js: a global
 * mock would hide the real crash.
 */
describe("expo-notifications must not load at import time", () => {
  it("the push store has no static import of the native module", () => {
    const source = readFileSync(join(__dirname, "../push.ts"), "utf8");
    expect(source).not.toMatch(/import\s+[^;]*from\s+["']expo-notifications["']/);
  });

  it("the push hook has no static import of the native module", () => {
    const source = readFileSync(join(__dirname, "../../hooks/usePushNotifications.ts"), "utf8");
    expect(source).not.toMatch(/import\s+[^;]*from\s+["']expo-notifications["']/);
  });

  it("login does not import push", () => {
    const source = readFileSync(join(__dirname, "../../app/(auth)/login.tsx"), "utf8");
    expect(source).not.toContain("PushEnableCard");
    expect(source).not.toContain("store/push");
    expect(source).not.toContain("expo-notifications");
  });

  it("constructing the store does not require the native module to exist", () => {
    jest.isolateModules(() => {
      jest.doMock("expo-notifications", () => {
        throw new Error("Expo Go does not support push");
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { usePush } = require("@/store/push") as typeof import("@/store/push");
      expect(usePush.getState().permission).toBe("unknown");
    });
  });
});
