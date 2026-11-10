import type { PlayOptinState } from "@/lib/api";

/** A Play opt-in answer for an Android APK the campaign is asking (gridgo-api `docs/PLAY_OPTIN_API.md`). */
export function playOptinState(overrides: Partial<PlayOptinState> = {}): PlayOptinState {
  return {
    app: "client",
    show: true,
    step: "confirm_gmail",
    gmailSuggestion: "tess@gmail.com",
    groupMode: "link",
    campaignEnabled: true,
    optInUrl: "https://play.google.com/apps/testing/ph.gridgo.client",
    groupJoinUrl: "https://groups.google.com/g/example-testers",
    target: 12,
    optedIn: false,
    dismissCount: 0,
    playStoreUrl: "https://play.google.com/store/apps/details?id=ph.gridgo.client",
    ...overrides,
  };
}

export const APK_INSTALL = { platform: "android", channel: "sideload" } as const;
