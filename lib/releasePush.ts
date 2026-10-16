import { APP_UPDATE_SOURCE, type AppDistribution } from "./appUpdate";
import { parsePushData } from "./push";

/**
 * How this install reached the phone, as `installChannel` on `POST /devices`
 * (gridgo-api `docs/RELEASE_ANNOUNCEMENTS_API.md`). The server sends each
 * release notice only to installs on its channel, so a Play or TestFlight
 * tester is not told about a version their store does not have yet.
 */
export type InstallChannel = "apk" | "play" | "ios";

/**
 * Every iPhone build is TestFlight's; an Android build is Play's only when CI
 * built the Play bundle, and the side-load APK otherwise. Web registers no push.
 */
export function installChannelFor(os: string, distribution: AppDistribution): InstallChannel | null {
  if (os === "ios") return "ios";
  if (os === "android") return distribution === "play" ? "play" : "apk";
  return null;
}

/** This app's Play package, fixed: a URL never comes from a payload. */
const PLAY_PACKAGE = "ph.gridgo.client";

/**
 * Where a release notice opens, by the payload's `storeTarget`. Each is the
 * app's own fixed destination, tried in order: the store app, then the web.
 */
const RELEASE_DESTINATIONS = {
  apk_download: { channel: "apk", urls: [APP_UPDATE_SOURCE.downloadUrl] },
  play_store: {
    channel: "play",
    urls: [
      `market://details?id=${PLAY_PACKAGE}`,
      `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`,
    ],
  },
  testflight: {
    channel: "ios",
    urls: ["itms-beta://", "https://apps.apple.com/app/testflight/id899247664"],
  },
} as const satisfies Record<string, { channel: InstallChannel; urls: readonly string[] }>;

/** The links a release notice opens, in the order to try them. */
export type ReleaseDestination = readonly string[];

const APK_TITLE = /^GRIDGO Client (0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8}) is ready$/;

function readField(data: unknown, key: string): string | null {
  if (!data || typeof data !== "object") return null;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Where a tapped release notice (push or inbox row) goes, or null to treat it
 * as an ordinary notice and open the inbox.
 *
 * A notice is acted on only when it is meant for this install's channel: a
 * Play or TestFlight install never opens the APK download, and an APK install
 * never opens a store. An unknown `storeTarget` is never guessed at. A notice
 * with neither field (an API from before channels, or an older anonymous push)
 * is recognised by the APK title alone, and only on an APK install.
 */
export function releaseNoticeDestination(
  data: unknown,
  title: unknown,
  channel: InstallChannel | null,
): ReleaseDestination | null {
  if (!channel || parsePushData(data).type !== "announcement") return null;
  const releaseChannel = readField(data, "releaseChannel");
  const storeTarget = readField(data, "storeTarget");

  if (!releaseChannel && !storeTarget) {
    if (channel !== "apk" || typeof title !== "string" || !APK_TITLE.test(title)) return null;
    return RELEASE_DESTINATIONS.apk_download.urls;
  }
  if (!storeTarget || !Object.prototype.hasOwnProperty.call(RELEASE_DESTINATIONS, storeTarget)) return null;
  const destination = RELEASE_DESTINATIONS[storeTarget as keyof typeof RELEASE_DESTINATIONS];
  if (destination.channel !== channel) return null;
  if (releaseChannel && releaseChannel !== destination.channel) return null;
  return destination.urls;
}

/** Open the first link the phone can handle. Never throws. */
export async function openReleaseDestination(
  urls: ReleaseDestination,
  openURL: (url: string) => Promise<unknown>,
): Promise<boolean> {
  for (const url of urls) {
    try {
      await openURL(url);
      return true;
    } catch {
      // No store app: try the next link.
    }
  }
  return false;
}
