import type { AppDistribution } from "@/lib/appUpdate";
import type { PlayOptinInstall, PlayOptinState } from "@/lib/api";

/**
 * Google Play's closed test, opted into from the app (gridgo-api
 * `docs/PLAY_OPTIN_API.md`). Android only: a side-loaded install confirms the
 * Google account Play will know them by, joins the tester group, becomes a
 * tester on Play and installs the Play build — the only install Play counts.
 *
 * GRIDGO decides who is asked (`show`) and where they stand (`step`). This
 * module only words it and orders it. Once the Play build reports itself, the
 * tester check-in (`lib/testerProgram.ts`) takes over.
 */

/** The broadcast's push and inbox type. */
export const PLAY_OPTIN_PUSH_TYPE = "play_optin";

/** The screen the card, the push and the inbox row all open. */
export const PLAY_OPTIN_ROUTE = "/play-optin";

/** GRIDGO's fixed campaign line, said whole to a screen reader. */
export const PLAY_OPTIN_COPY = "Help us launch GRIDGO on Play, become a tester.";

/** GRIDGO stops asking after the third dismissal. */
export const PLAY_OPTIN_MAX_DISMISSALS = 3;

/** This app's Play package: the store app's own link is built from it, never from a payload. */
const PLAY_PACKAGE = "ph.gridgo.client";

/**
 * What every call says about this install.
 *
 * `forceAndroid` is a development-only override
 * (`EXPO_PUBLIC_PLAY_OPTIN_FORCE_ANDROID=1`, read only under `__DEV__`) so the
 * side-load path can be walked in a browser; a release never sets it.
 */
export function playOptinInstall(os: string, distribution: AppDistribution, forceAndroid = false): PlayOptinInstall {
  const platform = forceAndroid ? "android" : os === "android" || os === "ios" ? os : "web";
  return { platform, channel: distribution === "play" ? "play" : "sideload" };
}

/** Whether Home draws the card: GRIDGO's `show`, on Android, and not closed in this session. */
export function playOptinCardVisible(
  state: PlayOptinState | null,
  install: PlayOptinInstall,
  dismissedThisSession: boolean,
): boolean {
  return Boolean(state?.show && install.platform === "android" && install.channel !== "play" && !dismissedThisSession);
}

export type GmailCheck = "ok" | "invalid" | "google_account_needed";

const EMAIL_SHAPE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

/** A Gmail address, or any address the person says is a Google account. Mirrors GRIDGO's own check. */
export function checkGmail(raw: string, googleAccount: boolean): GmailCheck {
  const email = raw.trim();
  if (!email || email.length > 254 || !EMAIL_SHAPE.test(email)) return "invalid";
  const [local, domain] = email.toLowerCase().split("@");
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return "invalid";
  if (isGmail(email) || googleAccount) return "ok";
  return domain ? "google_account_needed" : "invalid";
}

export function isGmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  return domain === "gmail.com" || domain === "googlemail.com";
}

export type OptinStepKey = "gmail" | "group" | "optin" | "install";
export type OptinStepStatus = "done" | "current" | "ahead";
export type OptinStep = { key: OptinStepKey; status: OptinStepStatus };

const STEP_ORDER: OptinStepKey[] = ["gmail", "group", "optin", "install"];

/** How far each GRIDGO step has got: the steps it has passed are done. */
function passed(step: string): number {
  switch (step) {
    case "join_group":
      return 1;
    case "open_optin":
      return 2;
    case "install_from_play":
      return 3;
    case "opted_in":
      return 4;
    default:
      return 0;
  }
}

/** The four steps in order: done, the one current, then those ahead. */
export function optinSteps(state: Pick<PlayOptinState, "step" | "optedIn">): OptinStep[] {
  const done = state.optedIn ? 4 : passed(state.step);
  return STEP_ORDER.map((key, index) => ({
    key,
    status: index < done ? "done" : index === done ? "current" : "ahead",
  }));
}

/** The step titles: a verb each, short enough for one line beside the disc. */
export function optinStepTitle(key: OptinStepKey): string {
  switch (key) {
    case "gmail":
      return "Confirm your Gmail";
    case "group":
      return "Join the tester group";
    case "optin":
      return "Become a tester";
    case "install":
      return "Install from Play";
  }
}

/** The one line under the current or done step. */
export function optinStepLine(
  key: OptinStepKey,
  status: OptinStepStatus,
  state: Pick<PlayOptinState, "groupMode" | "gmailSuggestion">,
): string | null {
  const email = state.gmailSuggestion ?? "";
  switch (key) {
    case "gmail":
      return status === "done" ? email : "The Google account on your Play Store";
    case "group":
      if (state.groupMode === "automatic") return status === "done" ? "Added for you" : "GRIDGO adds you";
      return status === "done" ? "Opened" : email ? `Tap Join group as ${email}` : "Tap Join group";
    case "optin":
      return status === "done" ? "Opened" : "Tap Become a tester on Play";
    case "install":
      return status === "done" ? "Done" : "Then open GRIDGO from Play";
  }
}

/** What GRIDGO's refusal means to the person, or null for one that only needs a fresh read. */
export function optinErrorCopy(code: string | null): string {
  switch (code) {
    case "invalid_gmail":
      return "Enter a Gmail address.";
    case "google_group_unavailable":
      return "Google didn't answer. Try again.";
    case "group_not_configured":
    case "campaign_not_available":
    case "campaign_disabled":
      return "Testing isn't open right now.";
    case "gmail_not_confirmed":
    case "group_step_required":
      return "Finish the step above first.";
    default:
      return "Couldn't reach GRIDGO. Try again.";
  }
}

/** The Play Store app first, then the web listing GRIDGO sent. */
export function playStoreLinks(playStoreUrl: string | null | undefined): string[] {
  const links = [`market://details?id=${PLAY_PACKAGE}`];
  if (playStoreUrl) links.push(playStoreUrl);
  else links.push(`https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`);
  return links;
}
