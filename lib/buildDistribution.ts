import { Platform } from "react-native";

import { parseAppDistribution, type AppDistribution } from "@/lib/appUpdate";
import { installChannelFor, type InstallChannel } from "@/lib/releasePush";

/**
 * This build's distribution: `play` only in the Google Play bundle CI builds
 * with `EXPO_PUBLIC_APP_DISTRIBUTION=play`, otherwise the side-load APK.
 *
 * Read as the literal `process.env.EXPO_PUBLIC_…` so Babel inlines it at
 * bundle time; a member access on `env` would never be replaced.
 */
export function buildDistribution(): AppDistribution {
  return parseAppDistribution(process.env.EXPO_PUBLIC_APP_DISTRIBUTION);
}

/** How this install reached the phone, sent as `installChannel` on `POST /devices`. */
export function appInstallChannel(): InstallChannel | null {
  return installChannelFor(Platform.OS, buildDistribution());
}
