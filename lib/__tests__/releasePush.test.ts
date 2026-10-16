import { Platform } from "react-native";

import { appInstallChannel } from "../buildDistribution";
import {
  installChannelFor,
  openReleaseDestination,
  releaseNoticeDestination,
} from "../releasePush";

const APK = "https://gridgo.talasora.com/downloads/gridgo-client.apk";
const PLAY = [
  "market://details?id=ph.gridgo.client",
  "https://play.google.com/store/apps/details?id=ph.gridgo.client",
];
const TESTFLIGHT = ["itms-beta://", "https://apps.apple.com/app/testflight/id899247664"];
const APK_TITLE = "GRIDGO Client 1.0.123 is ready";

const notice = (releaseChannel: string, storeTarget: string) => ({
  type: "announcement",
  releaseChannel,
  storeTarget,
});

describe("the install channel each build reports", () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
    jest.restoreAllMocks();
  });

  it("is apk for the side-load APK, play for the Play bundle and ios for every iPhone build", () => {
    expect(installChannelFor("android", "sideload")).toBe("apk");
    expect(installChannelFor("android", "play")).toBe("play");
    expect(installChannelFor("ios", "sideload")).toBe("ios");
    expect(installChannelFor("ios", "play")).toBe("ios");
    expect(installChannelFor("web", "sideload")).toBeNull();
  });

  it("reads this build's platform and distribution", () => {
    jest.replaceProperty(Platform, "OS", "android");
    expect(appInstallChannel()).toBe("apk");
    process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "play";
    expect(appInstallChannel()).toBe("play");
    jest.replaceProperty(Platform, "OS", "ios");
    expect(appInstallChannel()).toBe("ios");
  });
});

describe("where a tapped release notice opens", () => {
  it("opens the APK download only on an APK install", () => {
    expect(releaseNoticeDestination(notice("apk", "apk_download"), APK_TITLE, "apk")).toEqual([APK]);
    expect(releaseNoticeDestination(notice("apk", "apk_download"), APK_TITLE, "play")).toBeNull();
    expect(releaseNoticeDestination(notice("apk", "apk_download"), APK_TITLE, "ios")).toBeNull();
  });

  it("opens the Play listing, app first, on a Play install", () => {
    expect(releaseNoticeDestination(notice("play", "play_store"), "x", "play")).toEqual(PLAY);
    expect(releaseNoticeDestination(notice("play", "play_store"), "x", "apk")).toBeNull();
  });

  it("opens TestFlight, app first, on an iPhone", () => {
    expect(releaseNoticeDestination(notice("ios", "testflight"), "x", "ios")).toEqual(TESTFLIGHT);
    expect(releaseNoticeDestination(notice("ios", "testflight"), "x", "apk")).toBeNull();
  });

  it("never opens the APK download for a store install, whatever the title says", () => {
    for (const channel of ["play", "ios"] as const) {
      expect(releaseNoticeDestination({ type: "announcement" }, APK_TITLE, channel)).toBeNull();
    }
  });

  it("leaves an unknown target, a mismatched channel or a staff announcement to the inbox", () => {
    expect(releaseNoticeDestination(notice("play", "app_gallery"), "x", "play")).toBeNull();
    expect(releaseNoticeDestination(notice("play", "toString"), "x", "play")).toBeNull();
    expect(releaseNoticeDestination(notice("apk", "play_store"), "x", "play")).toBeNull();
    expect(releaseNoticeDestination({ type: "announcement", releaseChannel: "play" }, "x", "play")).toBeNull();
    expect(releaseNoticeDestination({ type: "announcement" }, "Office closed Monday", "apk")).toBeNull();
    expect(releaseNoticeDestination({ ...notice("apk", "apk_download"), type: "order_updated" }, APK_TITLE, "apk")).toBeNull();
    expect(releaseNoticeDestination(notice("apk", "apk_download"), APK_TITLE, null)).toBeNull();
  });

  it("still opens an older APK notice by its title alone on an APK install", () => {
    expect(releaseNoticeDestination({ type: "announcement" }, APK_TITLE, "apk")).toEqual([APK]);
    for (const title of ["Hello", "GRIDGO Other 1.0.123 is ready", "GRIDGO Client https://example.com is ready", ` ${APK_TITLE}`, null]) {
      expect(releaseNoticeDestination({ type: "announcement" }, title, "apk")).toBeNull();
    }
  });
});

describe("opening a release destination", () => {
  it("falls back to the web link when the store app is missing", async () => {
    const opened: string[] = [];
    const openURL = jest.fn(async (url: string) => {
      if (url.startsWith("market://")) throw new Error("no Play Store");
      opened.push(url);
    });
    await expect(openReleaseDestination(PLAY, openURL)).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledTimes(2);
    expect(opened).toEqual([PLAY[1]]);
  });

  it("stops at the first link that opens and never throws", async () => {
    const openURL = jest.fn(async () => undefined);
    await expect(openReleaseDestination(TESTFLIGHT, openURL)).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith("itms-beta://");
    expect(openURL).toHaveBeenCalledTimes(1);
    await expect(openReleaseDestination(TESTFLIGHT, async () => { throw new Error("no"); })).resolves.toBe(false);
  });
});
