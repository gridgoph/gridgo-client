import { Linking, Platform } from "react-native";

import { ApiError } from "@/lib/api";
import { usePlayOptin } from "@/store/playOptin";
import { playOptinState } from "@/test/playOptinFixtures";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getPlayOptin: jest.fn(),
    confirmPlayOptinGmail: jest.fn(),
    reportPlayOptinEvent: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const APK = { platform: "android", channel: "sideload" };

const state = playOptinState;

const originalOS = Platform.OS;
let openURL: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "android";
  usePlayOptin.getState().reset();
  api.getPlayOptin.mockResolvedValue(state());
  api.reportPlayOptinEvent.mockResolvedValue(undefined);
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});

afterEach(() => {
  Platform.OS = originalOS;
  openURL.mockRestore();
});

it("reads with this app's platform and APK channel on Android", async () => {
  await usePlayOptin.getState().load("u1");
  expect(api.getPlayOptin).toHaveBeenCalledWith(APK);
  expect(usePlayOptin.getState().state?.show).toBe(true);
});

it("asks nothing on iOS or web", async () => {
  for (const os of ["ios", "web"] as const) {
    Platform.OS = os;
    await usePlayOptin.getState().load("u1");
  }
  expect(api.getPlayOptin).not.toHaveBeenCalled();
  expect(usePlayOptin.getState().state).toBeNull();
});

it("forgets another account's answer", async () => {
  await usePlayOptin.getState().load("u1");
  api.getPlayOptin.mockReturnValue(new Promise(() => undefined));
  void usePlayOptin.getState().load("u2");
  expect(usePlayOptin.getState().state).toBeNull();
  expect(usePlayOptin.getState().owner).toBe("u2");
});

it("reports shown and tapped once per session, with platform and channel", async () => {
  await usePlayOptin.getState().load("u1");
  usePlayOptin.getState().shown();
  usePlayOptin.getState().shown();
  usePlayOptin.getState().tapped();
  usePlayOptin.getState().tapped();
  expect(api.reportPlayOptinEvent.mock.calls).toEqual([
    [APK, "shown"],
    [APK, "tapped"],
  ]);
});

it("reports every dismissal and closes the card for the session", async () => {
  await usePlayOptin.getState().load("u1");
  usePlayOptin.getState().dismiss();
  expect(usePlayOptin.getState().dismissedThisSession).toBe(true);
  expect(api.reportPlayOptinEvent).toHaveBeenCalledWith(APK, "dismissed");
});

it("hides the card for good once GRIDGO counts the third dismissal", async () => {
  api.getPlayOptin.mockResolvedValue(state({ show: false, dismissCount: 3 }));
  await usePlayOptin.getState().load("u1");
  expect(usePlayOptin.getState().state?.show).toBe(false);
});

it("automatic group: one confirm moves straight to the opt-in", async () => {
  await usePlayOptin.getState().load("u1");
  api.confirmPlayOptinGmail.mockResolvedValue(state({ groupMode: "automatic", step: "open_optin" }));
  await expect(usePlayOptin.getState().confirmGmail(" tess@gmail.com ", false)).resolves.toBe(true);
  expect(api.confirmPlayOptinGmail).toHaveBeenCalledWith(APK, "tess@gmail.com", false);
  expect(usePlayOptin.getState().state?.step).toBe("open_optin");
  expect(openURL).not.toHaveBeenCalled();
});

it("sends the Google-account assertion for a custom address", async () => {
  await usePlayOptin.getState().load("u1");
  api.confirmPlayOptinGmail.mockResolvedValue(state({ step: "join_group" }));
  await usePlayOptin.getState().confirmGmail("tess@shop.ph", true);
  expect(api.confirmPlayOptinGmail).toHaveBeenCalledWith(APK, "tess@shop.ph", true);
});

it("link group: opens the join link, reports it, then reads the next step", async () => {
  await usePlayOptin.getState().load("u1");
  api.confirmPlayOptinGmail.mockResolvedValue(state({ step: "join_group" }));
  await usePlayOptin.getState().confirmGmail("tess@gmail.com", false);
  api.getPlayOptin.mockResolvedValue(state({ step: "open_optin" }));
  await usePlayOptin.getState().openGroup();
  expect(api.reportPlayOptinEvent).toHaveBeenCalledWith(APK, "group_opened");
  expect(openURL).toHaveBeenCalledWith("https://groups.google.com/g/example-testers");
  expect(usePlayOptin.getState().state?.step).toBe("open_optin");
});

it("opens the Play opt-in and reports it", async () => {
  api.getPlayOptin.mockResolvedValue(state({ step: "open_optin" }));
  await usePlayOptin.getState().load("u1");
  await usePlayOptin.getState().openOptIn();
  expect(api.reportPlayOptinEvent).toHaveBeenCalledWith(APK, "optin_opened");
  expect(openURL).toHaveBeenCalledWith("https://play.google.com/apps/testing/ph.gridgo.client");
});

it("words a Google failure and keeps the step", async () => {
  await usePlayOptin.getState().load("u1");
  api.confirmPlayOptinGmail.mockRejectedValue(new ApiError(503, { error: "google_group_unavailable" }));
  await expect(usePlayOptin.getState().confirmGmail("tess@gmail.com", false)).resolves.toBe(false);
  expect(usePlayOptin.getState().error).toBe("Google didn't answer. Try again.");
  expect(usePlayOptin.getState().state?.step).toBe("confirm_gmail");
  expect(usePlayOptin.getState().busy).toBe(false);
});

it("opens the Play Store app for the install", async () => {
  api.getPlayOptin.mockResolvedValue(state({ step: "install_from_play" }));
  await usePlayOptin.getState().load("u1");
  await usePlayOptin.getState().openPlayStore();
  expect(openURL).toHaveBeenCalledWith("market://details?id=ph.gridgo.client");
});

it("marks a failed read for this account, keeps no state, and clears it once a read lands", async () => {
  api.getPlayOptin.mockRejectedValueOnce(new ApiError(503, { error: "service_unavailable" }));
  await usePlayOptin.getState().load("u1");
  expect(usePlayOptin.getState()).toMatchObject({ state: null, readFailed: true, reading: false });
  await usePlayOptin.getState().load("u1");
  expect(usePlayOptin.getState().readFailed).toBe(false);
  expect(usePlayOptin.getState().state?.show).toBe(true);
});
