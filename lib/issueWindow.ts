/**
 * The material-issue window.
 *
 * Two things changed under operational model v2, and both are visible here.
 * The window's length is one platform-wide setting Operations can change
 * without a release, so it is read from `GET /settings` and never hard-coded.
 * And it now really expires: the platform stamps `issueWindowExpiresAt` on the
 * order and closes the window when it passes. A remaining time is therefore an
 * honest thing to show, where under the old model it would have been a promise
 * no server kept.
 *
 * The state still decides whether a report is accepted — `POST /orders/:id/issues`
 * refuses one outside the window — so this module reads the order, not a timer.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Only used to word the policy before `GET /settings` answers. */
export const DEFAULT_ISSUE_WINDOW_HOURS = 24;

/** "24 hours", "2 days" — the window's length, as a person would say it. */
export function issueWindowLengthLabel(hours: number): string {
  if (hours >= 48 && hours % 24 === 0) return `${hours / 24} days`;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export type IssueKind = "material_quality" | "damage" | "wrong_item" | "delivery" | "other";

export type IssueKindOption = {
  value: IssueKind;
  label: string;
  hint: string;
};

/** Kinds the API accepts, in the words a client would use. */
export const ISSUE_KINDS: IssueKindOption[] = [
  {
    value: "material_quality",
    label: "Print or material quality",
    hint: "Colour, resolution, finish or stock is not what was agreed",
  },
  {
    value: "damage",
    label: "Damaged on arrival",
    hint: "Creased, torn, wet or scuffed when it reached you",
  },
  {
    value: "wrong_item",
    label: "Wrong item or quantity",
    hint: "Different product, size, or a short count",
  },
  {
    value: "delivery",
    label: "Delivery problem",
    hint: "Left in the wrong place, or handed to the wrong person",
  },
  {
    value: "other",
    label: "Something else",
    hint: "Describe it and Operations will route it",
  },
];

export function issueKindLabel(kind: string | null | undefined): string {
  return ISSUE_KINDS.find((option) => option.value === kind)?.label ?? "Reported issue";
}

/** Shortest description Operations can act on. */
export const MIN_ISSUE_DESCRIPTION = 15;

export function checkIssueDescription(description: string): {
  ok: boolean;
  reason: string | null;
} {
  const trimmed = description.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: "Describe what is wrong. Operations holds the supplier payout on your word alone, so it has to be specific.",
    };
  }
  if (trimmed.length < MIN_ISSUE_DESCRIPTION) {
    return {
      ok: false,
      reason: `Add a little more detail — at least ${MIN_ISSUE_DESCRIPTION} characters. "Colour is washed out across all 200 flyers" is enough.`,
    };
  }
  return { ok: true, reason: null };
}

export type IssueWindowStatus = {
  /** True when the API will accept a report right now. */
  canReport: boolean;
  headline: string;
  detail: string;
  /** "Delivered 3 hours ago" — real elapsed time since the window opened. */
  elapsedLabel: string | null;
  /**
   * "Closes in about 21 hours" — real remaining time, from the expiry the
   * platform stamped on the order. Null when the order carries no expiry.
   */
  remainingLabel: string | null;
};

/** When the order entered the issue window, from its own timeline. */
export function issueWindowOpenedAt(
  timeline: { at: string; state: string }[] | null | undefined,
): string | null {
  if (!Array.isArray(timeline) || timeline.length === 0) return null;
  const entry = [...timeline].reverse().find((e) => e.state === "issue_window_open");
  return entry?.at ?? null;
}

function spanWords(ms: number): string {
  const hours = Math.floor(ms / HOUR_MS);
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(ms / 60_000));
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${Math.floor(hours / 24)} days`;
}

function msFrom(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function summarizeIssueWindow({
  state,
  openedAt,
  expiresAt,
  windowHours = DEFAULT_ISSUE_WINDOW_HOURS,
  hasOpenIssue,
  now = Date.now(),
}: {
  state: string;
  openedAt: string | null;
  /** `issueWindowExpiresAt` from the order. The platform enforces it. */
  expiresAt?: string | null;
  /** `issueWindowHours` from `GET /settings`. */
  windowHours?: number;
  hasOpenIssue: boolean;
  now?: Date | number;
}): IssueWindowStatus {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const openedMs = msFrom(openedAt);
  const expiresMs = msFrom(expiresAt);

  const elapsed = openedMs == null ? null : nowMs - openedMs;
  const elapsedLabel = elapsed == null ? null : `Delivered ${spanWords(elapsed)} ago`;
  const remaining = expiresMs == null ? null : expiresMs - nowMs;
  const remainingLabel =
    remaining != null && remaining > 0 ? `Closes in about ${spanWords(remaining)}` : null;

  if (hasOpenIssue) {
    return {
      canReport: false,
      headline: "Your report is with Operations.",
      detail:
        "The supplier payout is held while they review it. You will get a notification when there is a decision.",
      elapsedLabel,
      remainingLabel,
    };
  }

  if (state !== "issue_window_open") {
    return {
      canReport: false,
      headline: "The issue window is closed.",
      detail:
        "This job has been signed off. Message Operations if something is still wrong with it.",
      elapsedLabel,
      remainingLabel: null,
    };
  }

  return {
    canReport: true,
    headline: `Tell Operations within ${issueWindowLengthLabel(windowHours)} of delivery.`,
    detail:
      "Reporting holds the supplier payout while Operations reviews it, so send it as soon as you see a problem. The window closes on its own once it passes.",
    elapsedLabel,
    remainingLabel,
  };
}
