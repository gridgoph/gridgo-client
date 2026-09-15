/**
 * The end of a job, said properly.
 *
 * Under operational model v2 a job closes on its own: the platform stamps an
 * expiry on the issue window and moves the order to `completed` when it
 * passes. Nobody presses a button, so nobody says anything — and the order
 * screen was left reading "This job is closed." That is a shrug at the moment
 * a client most wants to hear that everything went as it should.
 *
 * This module turns the record into that sentence. It reads what actually
 * happened — the handover, whether anything was reported inside the window,
 * whether the money is settled — and never claims more than the record shows.
 * If the issue list could not be read, the window "has closed"; only a read
 * that came back empty earns "nothing reported".
 */

import type { Issue, Order } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { paymentStatusLabel } from "@/lib/copy";
import { GRIDGO_OFFICE_LABEL } from "@/lib/gridgoOffice";
import { collectsAtOffice, orderTotalMinor } from "@/lib/orderState";
import { formatTimelineStamp } from "@/lib/relativeTime";

/** The two states that mean the job is over for the client. */
export function isJobComplete(state: string | null | undefined): boolean {
  return state === "completed" || state === "payout_released";
}

/**
 * What the issue window turned out to hold.
 *
 * `unknown` is the honest value before `GET /orders/:id/issues` answers, and
 * after it fails: the copy then says the window closed and no more.
 */
export type IssueOutcome = "none" | "resolved" | "open" | "unknown";

export function issueOutcome(issues: Issue[] | null | undefined): IssueOutcome {
  if (!Array.isArray(issues)) return "unknown";
  if (issues.length === 0) return "none";
  if (issues.some((issue) => issue.status === "open")) return "open";
  return "resolved";
}

export type JobCompleteFact = {
  label: string;
  value: string;
};

export type JobCompleteSummary = {
  headline: string;
  body: string;
  facts: JobCompleteFact[];
};

type TimelineLike = { at: string; state: string }[] | null | undefined;

/** When the order most recently entered one of `states`, or null. */
function latestEntryAt(timeline: TimelineLike, states: readonly string[]): string | null {
  if (!Array.isArray(timeline)) return null;
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (states.includes(entry.state) && entry.at) return entry.at;
  }
  return null;
}

/** When the job reached the client: the handover entry, else the window opening. */
export function handoverAt(order: Pick<Order, "timeline" | "issueWindowOpenedAt">): string | null {
  return latestEntryAt(order.timeline, ["delivered"]) ?? order.issueWindowOpenedAt ?? null;
}

/** When the platform closed the job. */
export function closedAt(order: Pick<Order, "timeline">): string | null {
  return latestEntryAt(order.timeline, ["completed", "payout_released"]);
}

export function summarizeJobComplete(order: Order, issues: Issue[] | null | undefined): JobCompleteSummary {
  const collect = collectsAtOffice(order);
  const outcome = issueOutcome(issues);
  const paid = order.paymentStatus === "paid";
  const total = orderTotalMinor(order);

  const handover = collect ? `collected at ${GRIDGO_OFFICE_LABEL}` : "delivered";
  const settled = paid ? " Your payment is settled in full." : "";

  let body: string;
  switch (outcome) {
    case "none":
      body = `Your order was ${handover} and the check window closed with nothing reported.${settled} This job is closed, and nothing more is needed from you.`;
      break;
    case "resolved":
      body = `Your order was ${handover}. The problem you reported was settled by Operations, and this job is now closed.${settled}`;
      break;
    case "open":
      body = `Your order was ${handover}. Your report is still with Operations, and you will be notified when there is a decision.`;
      break;
    default:
      body = `Your order was ${handover} and the check window has closed.${settled} This job is closed.`;
  }

  const facts: JobCompleteFact[] = [];

  const arrived = handoverAt(order);
  if (arrived) {
    facts.push({ label: collect ? "Collected" : "Delivered", value: formatTimelineStamp(arrived) });
  }

  const windowValue =
    outcome === "none"
      ? "Closed, nothing reported"
      : outcome === "resolved"
        ? "Closed, report settled"
        : outcome === "open"
          ? "Report under review"
          : "Closed";
  facts.push({ label: "Check window", value: windowValue });

  facts.push({
    label: "Payment",
    value: paid && total != null ? `Paid in full, ${formatPhp(total)}` : paymentStatusLabel(order.paymentStatus),
  });

  if (order.rated) {
    facts.push({ label: "Your rating", value: "Sent, thank you" });
  }

  return {
    headline: "Job complete",
    body,
    facts,
  };
}
