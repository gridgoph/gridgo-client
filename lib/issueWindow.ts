/**
 * The 24-hour material-issue window.
 *
 * The platform decides whether the window is open from the order's state, not
 * from a timer: `POST /orders/:id/issues` accepts a report while the order is
 * in the issue window and refuses it otherwise. So this module presents the
 * policy and the real elapsed time since delivery, and deliberately shows no
 * countdown — a ticking clock would imply an expiry the server does not run.
 */

const HOUR_MS = 60 * 60 * 1000;

/** The policy Operations applies when reviewing a report. */
export const ISSUE_WINDOW_HOURS = 24;

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
  /** "Delivered 3 hours ago" — a real elapsed time, never a countdown. */
  elapsedLabel: string | null;
  /** True once more than 24 hours have passed since delivery. */
  pastPolicyWindow: boolean;
};

/** When the order entered the issue window, from its own timeline. */
export function issueWindowOpenedAt(
  timeline: { at: string; state: string }[],
): string | null {
  const entry = [...timeline].reverse().find((e) => e.state === "issue_window_open");
  return entry?.at ?? null;
}

function elapsedWords(ms: number): string {
  const hours = Math.floor(ms / HOUR_MS);
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(ms / 60_000));
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export function summarizeIssueWindow({
  state,
  openedAt,
  hasOpenIssue,
  now = Date.now(),
}: {
  state: string;
  openedAt: string | null;
  hasOpenIssue: boolean;
  now?: Date | number;
}): IssueWindowStatus {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const openedMs = openedAt ? new Date(openedAt).getTime() : NaN;
  const elapsed = Number.isFinite(openedMs) ? nowMs - openedMs : null;
  const elapsedLabel = elapsed != null ? `Delivered ${elapsedWords(elapsed)}` : null;
  const pastPolicyWindow = elapsed != null && elapsed > ISSUE_WINDOW_HOURS * HOUR_MS;

  if (hasOpenIssue) {
    return {
      canReport: false,
      headline: "Your report is with Operations.",
      detail:
        "The supplier payout is held while they review it. You will get a notification when there is a decision.",
      elapsedLabel,
      pastPolicyWindow,
    };
  }

  if (state !== "issue_window_open") {
    return {
      canReport: false,
      headline: "The issue window is closed.",
      detail:
        "This job has been signed off. Message Operations if something is still wrong with it.",
      elapsedLabel,
      pastPolicyWindow,
    };
  }

  if (pastPolicyWindow) {
    return {
      canReport: true,
      headline: "You are past the 24-hour policy window.",
      detail:
        "You can still send a report and Operations will read it, but a late report carries less weight than one filed on the day.",
      elapsedLabel,
      pastPolicyWindow,
    };
  }

  return {
    canReport: true,
    headline: `Report a material issue within ${ISSUE_WINDOW_HOURS} hours of delivery.`,
    detail:
      "Reporting holds the supplier payout while Operations reviews it, so send it as soon as you see a problem.",
    elapsedLabel,
    pastPolicyWindow,
  };
}
