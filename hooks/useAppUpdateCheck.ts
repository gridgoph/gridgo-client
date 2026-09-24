import Constants from "expo-constants";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import { installedBuild, parseForcedVersionCode, type AppBuild } from "@/lib/appUpdate";
import { isExpoGoRuntime } from "@/lib/push";
import { useAppUpdate } from "@/store/appUpdate";

/**
 * This launch's build, as far as the update check is concerned.
 *
 * The override is read as the literal `process.env.EXPO_PUBLIC_…` so Babel
 * inlines it; a member access on `env` would never be replaced.
 */
export function readInstalledBuild(): AppBuild | null {
  return installedBuild({
    platform: Platform.OS,
    expoGo: isExpoGoRuntime({
      appOwnership: Constants.appOwnership,
      executionEnvironment: Constants.executionEnvironment,
    }),
    dev: __DEV__,
    versionName: Constants.expoConfig?.version,
    versionCode: Constants.expoConfig?.android?.versionCode,
    forcedVersionCode: parseForcedVersionCode(
      process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE,
    ),
  });
}

/**
 * Looks for a newer GRIDGO release on launch and whenever the app comes back
 * to the foreground, at most once per `APP_UPDATE_CHECK_INTERVAL_MS`. Mounted
 * once in the root layout. It draws nothing: `AppUpdateSheet` reads the store.
 */
export function useAppUpdateCheck(): void {
  const hydrated = useAppUpdate((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    const { start, check } = useAppUpdate.getState();
    start(readInstalledBuild());
    void check();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void useAppUpdate.getState().check();
    });
    return () => subscription.remove();
  }, [hydrated]);
}
