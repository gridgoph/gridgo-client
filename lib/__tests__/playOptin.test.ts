import {
  checkGmail,
  optinErrorCopy,
  optinSteps,
  PLAY_OPTIN_PUSH_TYPE,
  PLAY_OPTIN_ROUTE,
  playOptinCardVisible,
  playOptinInstall,
  playStoreLinks,
} from "@/lib/playOptin";
import { parsePushData, pushTargetRoute } from "@/lib/push";
import type { PlayOptinState } from "@/lib/api";
import { playOptinState } from "@/test/playOptinFixtures";

const state = playOptinState;

describe("playOptinInstall", () => {
  it("names the platform and maps the APK to the sideload channel", () => {
    expect(playOptinInstall("android", "sideload")).toEqual({ platform: "android", channel: "sideload" });
    expect(playOptinInstall("android", "play")).toEqual({ platform: "android", channel: "play" });
    expect(playOptinInstall("ios", "sideload")).toEqual({ platform: "ios", channel: "sideload" });
    expect(playOptinInstall("web", "sideload")).toEqual({ platform: "web", channel: "sideload" });
    expect(playOptinInstall("windows", "sideload").platform).toBe("web");
  });

  it("lets a development override walk the Android path anywhere", () => {
    expect(playOptinInstall("web", "sideload", true)).toEqual({ platform: "android", channel: "sideload" });
  });
});

describe("playOptinCardVisible", () => {
  const apk = { platform: "android", channel: "sideload" } as const;

  it("shows on an Android APK when GRIDGO says show", () => {
    expect(playOptinCardVisible(state(), apk, false)).toBe(true);
  });

  it("never shows on iOS or web, even if a payload said show", () => {
    expect(playOptinCardVisible(state(), { platform: "ios", channel: "sideload" }, false)).toBe(false);
    expect(playOptinCardVisible(state(), { platform: "web", channel: "sideload" }, false)).toBe(false);
  });

  it("never shows on the Play build: it is already a tester", () => {
    expect(playOptinCardVisible(state(), { platform: "android", channel: "play" }, false)).toBe(false);
  });

  it("follows GRIDGO's show, including after the third dismissal", () => {
    expect(playOptinCardVisible(state({ show: false, dismissCount: 3 }), apk, false)).toBe(false);
    expect(playOptinCardVisible(null, apk, false)).toBe(false);
  });

  it("stays closed for the session once dismissed", () => {
    expect(playOptinCardVisible(state({ dismissCount: 1 }), apk, true)).toBe(false);
  });
});

describe("checkGmail", () => {
  it("accepts Gmail and Googlemail addresses", () => {
    expect(checkGmail("tess@gmail.com", false)).toBe("ok");
    expect(checkGmail("  Tess.Lee@GoogleMail.com ", false)).toBe("ok");
  });

  it("asks for the Google-account assertion on any other address", () => {
    expect(checkGmail("tess@shop.ph", false)).toBe("google_account_needed");
    expect(checkGmail("tess@shop.ph", true)).toBe("ok");
  });

  it("refuses what is not an address", () => {
    for (const bad of ["", "tess", "tess@", "@gmail.com", ".tess@gmail.com", "te..ss@gmail.com", "tess@gmail"]) {
      expect(checkGmail(bad, true)).toBe("invalid");
    }
  });
});

describe("optinSteps", () => {
  const statuses = (overrides: Partial<PlayOptinState>) => optinSteps(state(overrides)).map((step) => step.status);

  it("walks GRIDGO's step through the four", () => {
    expect(statuses({ step: "confirm_gmail" })).toEqual(["current", "ahead", "ahead", "ahead"]);
    expect(statuses({ step: "join_group" })).toEqual(["done", "current", "ahead", "ahead"]);
    expect(statuses({ step: "open_optin" })).toEqual(["done", "done", "current", "ahead"]);
    expect(statuses({ step: "install_from_play" })).toEqual(["done", "done", "done", "current"]);
    expect(statuses({ step: "opted_in", optedIn: true })).toEqual(["done", "done", "done", "done"]);
  });

  it("starts an unknown step at the beginning rather than guessing", () => {
    expect(statuses({ step: "something_new" })).toEqual(["current", "ahead", "ahead", "ahead"]);
  });
});

it("words GRIDGO's refusals", () => {
  expect(optinErrorCopy("invalid_gmail")).toBe("Enter a Gmail address.");
  expect(optinErrorCopy("google_group_unavailable")).toBe("Google didn't answer. Try again.");
  expect(optinErrorCopy("campaign_not_available")).toBe("Testing isn't open right now.");
  expect(optinErrorCopy(null)).toBe("Couldn't reach GRIDGO. Try again.");
});

it("opens the Play Store app before the web listing", () => {
  expect(playStoreLinks(state().playStoreUrl)).toEqual([
    "market://details?id=ph.gridgo.client",
    "https://play.google.com/store/apps/details?id=ph.gridgo.client",
  ]);
});

it("routes the play_optin push to the opt-in steps", () => {
  expect(pushTargetRoute(parsePushData({ type: PLAY_OPTIN_PUSH_TYPE, notificationId: "n1", at: "2026-11-10T00:00:00Z" }))).toBe(
    PLAY_OPTIN_ROUTE,
  );
});
