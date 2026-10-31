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

/** The problem report asks for at least one photo, and takes up to ten (`refund_evidence`). */
export const MIN_PROBLEM_PHOTOS = 1;
export const MAX_PROBLEM_PHOTOS = 10;
export const PROBLEM_PHOTO_MAX_MIB = 15;

/** What happens once a report is sent, said before and after sending it. */
export const PROBLEM_OUTCOME_COPY =
  "Operations reviews your photos with what GRIDGO recorded on this job, and gives you the outcome within 2 business days.";

/** The first thing stopping the photos from going with the report, or null. */
export function checkProblemPhotos(photos: readonly { phase: string }[]): string | null {
  if (photos.some((photo) => photo.phase === "sending")) return "Wait for the photos to finish uploading.";
  const stored = photos.filter((photo) => photo.phase === "stored").length;
  if (stored < MIN_PROBLEM_PHOTOS) return "Add at least one photo that shows what is wrong.";
  if (stored > MAX_PROBLEM_PHOTOS) return `Send at most ${MAX_PROBLEM_PHOTOS} photos.`;
  return null;
}

const REMEDY_LABELS: Record<string, string> = {
  reprint: "A reprint",
  replacement: "A replacement",
  partial_refund: "A partial refund",
  full_refund: "A full refund",
  none: "No change to the order",
};

/**
 * Operations' finding as the client reads it: the remedy and their reason.
 * Who was at fault is Operations' working, not a line for the client; a
 * finding still waiting on approval is said to be, never shown as decided.
 */
export function issueDecisionView(
  decision: { remedy: string; reason: string; status: string } | null | undefined,
): { headline: string; reason: string | null } | null {
  if (!decision) return null;
  if (decision.status !== "approved") {
    return {
      headline: "Operations has reached a finding and is getting it approved",
      reason: null,
    };
  }
  return {
    headline: REMEDY_LABELS[decision.remedy] ?? "Operations has decided",
    reason: decision.reason.trim() || null,
  };
}

export type IssueWindowStatus = {
  /** True when the API will accept a report right now. */
  canReport: boolean;
  headline: string;
  detail: string;
  /**
   * What else follows from the choice — the payout hold, the window closing
   * by itself — kept folded under the decision while it is open, so the two
   * sentences above it are the whole decision. Null when there is no choice.
   */
  consequences?: string | null;
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

export type IssueWindowClock = {
  /** Never below zero: a window past its expiry is closing, not owed time. */
  remainingMs: number;
  /** The share of the window still left, 0 to 1 — what the meter draws. */
  fraction: number;
  /** "21:47:09": whole hours, then minutes and seconds. A 72-hour window reads "71:59:59". */
  clock: string;
  /** "21 hours 47 minutes left" — for a screen reader, which should not hear every second. */
  spoken: string;
  closesAt: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The live countdown to the window's close (report 5A28D524).
 *
 * Counts to `issueWindowExpiresAt`, the expiry the platform stamped and
 * enforces, so the clock and the server agree on when a report stops being
 * accepted. The window's length — what the meter is a share of — is the span
 * between the two stamps on the order, else `issueWindowHours` from
 * `GET /settings`; never a constant of the app's. Null when the order carries
 * no expiry: an old payload gets no clock rather than a guessed one.
 */
export function issueWindowClock({
  openedAt,
  expiresAt,
  windowHours = DEFAULT_ISSUE_WINDOW_HOURS,
  now = Date.now(),
}: {
  openedAt: string | null;
  expiresAt: string | null | undefined;
  /** `issueWindowHours` from `GET /settings`, used only when the order has no opening stamp. */
  windowHours?: number;
  now?: Date | number;
}): IssueWindowClock | null {
  const expiresMs = msFrom(expiresAt);
  if (expiresMs == null || !expiresAt) return null;
  const nowMs = typeof now === "number" ? now : now.getTime();
  const openedMs = msFrom(openedAt);
  const lengthMs =
    openedMs != null && expiresMs > openedMs ? expiresMs - openedMs : windowHours * HOUR_MS;

  const remainingMs = Math.max(0, expiresMs - nowMs);
  const fraction = lengthMs > 0 ? Math.min(1, remainingMs / lengthMs) : 0;
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hourWords = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const minuteWords = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const spoken =
    remainingMs <= 0
      ? "Closing now"
      : hours > 0
        ? `${hourWords} ${minuteWords} left`
        : minutes > 0
          ? `${minuteWords} left`
          : "Less than a minute left";

  return {
    remainingMs,
    fraction,
    clock: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    spoken,
    closesAt: new Date(expiresMs).toISOString(),
  };
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
      headline: "Operations received your report.",
      detail: `${PROBLEM_OUTCOME_COPY} The supplier payout is held meanwhile, and you get a notification when there is a decision.`,
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

  /*
    Two endings, and the good one leads. Most jobs arrive fine, and a card that
    opened with "tell Operations" read as though something was expected to be
    wrong. The decision is two sentences; what follows from it (the payout
    hold, the clock closing it) is folded under them, and closing as fine still
    states its full effect in its own confirmation (ux-findings-1030 #9).
  */
  return {
    canReport: true,
    headline: "Your order is with you. Is everything okay?",
    detail: `Confirm only if everything is fine. If something is wrong, report it within ${issueWindowLengthLabel(windowHours)} of delivery.`,
    consequences:
      "Reporting holds the supplier payout while Operations reviews it. Say nothing and the window closes on its own once it passes.",
    elapsedLabel,
    remainingLabel,
  };
}
