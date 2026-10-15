import { createElement } from "react";
import { render } from "@testing-library/react-native";
import { Platform } from "react-native";

import { useAppUpdateCheck } from "@/hooks/useAppUpdateCheck";
import { useAppUpdate } from "@/store/appUpdate";

// Expo Go, made a build by the dev override, as in layout-app-update.test.tsx.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    appOwnership: "expo",
    executionEnvironment: "storeClient",
    expoConfig: { version: "1.0.0", android: { versionCode: 1 }, extra: {} },
  },
}));

function Probe() {
  useAppUpdateCheck();
  return null;
}

beforeEach(() => {
  useAppUpdate.getState().reset();
  useAppUpdate.setState({ hydrated: true });
  jest.spyOn(console, "info").mockImplementation(() => undefined);
  process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE = "90";
  jest.replaceProperty(Platform, "OS", "android");
  (global.fetch as jest.Mock).mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tag_name: "v1.0.95", draft: false, prerelease: false }),
  }));
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE;
  delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
  (global.fetch as jest.Mock).mockReset();
  jest.restoreAllMocks();
});

describe("the update check, by distribution", () => {
  it("reads GitHub in a side-load build", async () => {
    await render(createElement(Probe));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(useAppUpdate.getState().offersUpdates).toBe(true);
  });

  it("never reads GitHub or offers the APK in a Google Play build", async () => {
    process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "play";
    await render(createElement(Probe));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(useAppUpdate.getState()).toMatchObject({
      installed: { versionCode: 90, versionName: "1.0.90" },
      offersUpdates: false,
      promptOpen: false,
    });
    expect(console.info).toHaveBeenCalledWith(
      "[update-check] off: a Google Play build, and Play installs its own updates",
    );
  });
});
