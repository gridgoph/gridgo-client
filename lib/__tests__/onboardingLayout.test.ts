import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Client onboarding uses the same PNG pager as Supplier and Rider:
 * picture on the page, copy under it — not a short text band under SVG art.
 */
describe("onboarding layout contract", () => {
  const source = readFileSync(join(__dirname, "../../app/onboarding.tsx"), "utf8");

  it("pages full-height slides with the picture on the page", () => {
    expect(source).toContain("OnboardingMark");
    expect(source).toMatch(/horizontal\s*\n\s*pagingEnabled/);
    expect(source).toContain("estimatePagerHeight");
    expect(source).not.toContain("StyleSheet.absoluteFillObject");
    expect(source).not.toContain("translateX: -delta * width * 0.4");
  });

  it("exits through the explicit returnTo map, not history alone", () => {
    expect(source).toContain("resolveOnboardingDismissTarget");
    expect(source).toContain("returnTo");
  });

  it("never asks where the client is (gridgo-client#159)", () => {
    const sources = [
      source,
      readFileSync(join(__dirname, "../../data/onboarding.ts"), "utf8"),
      readFileSync(join(__dirname, "../onboardingFlow.ts"), "utf8"),
      readFileSync(join(__dirname, "../../components/onboarding/NotificationPreview.tsx"), "utf8"),
      readFileSync(join(__dirname, "../../components/onboarding/ScheduleDocket.tsx"), "utf8"),
    ];
    for (const text of sources) {
      expect(text).not.toMatch(/expo-location|deviceLocation|ForegroundPermissions/);
      expect(text).not.toMatch(/TextInput|TextField|PinPicker|DropoffLocator/);
    }
  });

  it("raises the notification dialog from a tap, never on mount", () => {
    expect(source).not.toContain("requestPermissionsAsync");
    expect(source).toMatch(/async function enableNotifications\(\)/);
  });
});

