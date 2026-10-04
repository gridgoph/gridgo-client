/**
 * Onboarding's rules, apart from the pager that draws them.
 *
 * The sequence itself is `data/onboarding.ts`. This module decides what the
 * header's Skip does, what the one yellow button says on each page, and how
 * the notification page reads the phone's permission — so every branch can be
 * tested without pressing anything.
 *
 * The ranking is the one page that cannot be skipped on a first run: the
 * landing ladder sends an unranked client here, and matching has nothing to
 * decide on without it. Skip therefore jumps *to* the ranking until there is
 * one, and only leaves once there is.
 */

import type { OnboardingStep } from "@/data/onboarding";
import type { PushPermission } from "@/lib/push";

/** "01 / 06" — position in text, so it survives grayscale and reduced motion. */
export function onboardingStepLabel(index: number, total: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(index + 1)} / ${pad(total)}`;
}

/** Where the ranking sits in the sequence. */
export function rankingIndex(steps: readonly OnboardingStep[]): number {
  return steps.findIndex((step) => step.kind === "ranking");
}

export type OnboardingSkip =
  /** Nothing in the header: the page has its own way on. */
  | null
  | { type: "to_ranking"; index: number; label: string }
  | { type: "leave"; label: string };

/**
 * The header's Skip.
 *
 * - On the ranking itself there is nothing to skip to, and on a first run
 *   nothing to skip past either, so the header stays empty.
 * - Before it, an unranked client skips the features and lands on the ranking.
 * - A client who has ranked (a replay from Settings) skips straight out.
 */
export function onboardingSkip(
  steps: readonly OnboardingStep[],
  index: number,
  ranked: boolean,
): OnboardingSkip {
  const step = steps[index];
  if (!step || step.kind === "ranking") return null;
  if (ranked) return { type: "leave", label: "Skip onboarding" };
  const ranking = rankingIndex(steps);
  if (ranking < 0) return { type: "leave", label: "Skip onboarding" };
  return { type: "to_ranking", index: ranking, label: "Skip to your ranking" };
}

/**
 * How the notification page reads this phone.
 *
 * - `unavailable`: push cannot reach this runtime (web). Saying "turn on" to a
 *   phone that cannot would be a button that does nothing.
 * - `on`: already granted, often by Android before 13. Nothing to ask.
 * - `blocked`: Android stopped offering the dialog. Only the phone's settings
 *   can change it, so that is the offer.
 * - `ask`: everything else, including a permission not read yet. The ask is
 *   raised only by the tap, and a runtime with no native module answers it
 *   with a quiet no — the page moves on either way.
 */
export type OnboardingPushMode = "unavailable" | "on" | "blocked" | "ask";

export function onboardingPushMode(input: {
  supported: boolean;
  permission: PushPermission;
}): OnboardingPushMode {
  if (!input.supported) return "unavailable";
  if (input.permission === "granted") return "on";
  if (input.permission === "blocked") return "blocked";
  return "ask";
}

export type OnboardingPushAction = "enable" | "open_settings" | "next";

/** The notification page's buttons. "Not now" is offered only where there is a "now". */
export function onboardingPushButtons(mode: OnboardingPushMode): {
  primary: { label: string; action: OnboardingPushAction };
  later: string | null;
  /** One line under the moments, when the phone's state needs saying. */
  status: string | null;
} {
  switch (mode) {
    case "ask":
      return {
        primary: { label: "Turn on notifications", action: "enable" },
        later: "Not now",
        status: null,
      };
    case "blocked":
      return {
        primary: { label: "Open phone settings", action: "open_settings" },
        later: "Not now",
        status: "Your phone is blocking GRIDGO's notifications. Only its settings can turn them back on.",
      };
    case "on":
      return {
        primary: { label: "Next", action: "next" },
        later: null,
        status: "Notifications are on for this phone.",
      };
    case "unavailable":
      return {
        primary: { label: "Next", action: "next" },
        later: null,
        status: "This device cannot show GRIDGO notifications. Your updates still appear in the app.",
      };
  }
}

export type OnboardingRankingAction = "save" | "finish" | "none";

/**
 * The ranking page's button, through every honest state of a save.
 *
 * - `Saving…` while the request is out.
 * - `Done` when the order on screen is the one GRIDGO already holds (a replay,
 *   or a save that has landed) — there is nothing to save, only to leave.
 * - `Try again` after a failure, so the button says the order is not kept.
 * - `Save and continue`, disabled until all four are placed: a half-ranked
 *   list cannot match.
 */
export function onboardingRankingButton(input: {
  complete: boolean;
  saving: boolean;
  upToDate: boolean;
  failed: boolean;
}): { label: string; action: OnboardingRankingAction; disabled: boolean } {
  if (input.saving) return { label: "Saving…", action: "none", disabled: true };
  if (input.upToDate) return { label: "Done", action: "finish", disabled: false };
  if (!input.complete) return { label: "Save and continue", action: "none", disabled: true };
  if (input.failed) return { label: "Try again", action: "save", disabled: false };
  return { label: "Save and continue", action: "save", disabled: false };
}
