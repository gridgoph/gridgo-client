/**
 * Supplier fulfilment milestones, as the client reads them.
 *
 * This is what replaced the supplier proof approve / request-changes loop: the
 * client no longer signs off a print proof, they watch the job being made. The
 * platform gates each milestone on a Proof of Fulfilment the supplier or rider
 * files, so a milestone moving is evidence landing, not a claim.
 *
 * The client is never shown what a milestone is worth. The percentages are
 * shares of the supplier's earnings, the server withholds the amounts, and a
 * payout schedule is not the client's business.
 */

import type { PayoutMilestone } from "@/lib/api";
import type { OrderStatusIcon, OrderStatusTone } from "@/lib/orderState";

export type FulfilmentStep = {
  code: string;
  label: string;
  /** What has to be true for this step to be done. */
  detail: string;
  statusLabel: string;
  tone: OrderStatusTone;
  icon: OrderStatusIcon;
};

/**
 * The three milestones that describe making and moving the job.
 *
 * `retention` is deliberately absent: it is a hold-back on the supplier's
 * payout released after the issue window, not a thing that happens to the
 * client's order. Showing it would name someone else's money.
 */
const STEP_COPY: Record<string, { label: string; detail: string }> = {
  printing: {
    label: "Printing",
    detail: "Your supplier is running the job on the press.",
  },
  packaging_qc: {
    label: "Packaging and quality check",
    detail: "The finished job is checked and packed for transport.",
  },
  delivered: {
    label: "Delivered",
    detail: "A rider has handed the job over and filed the evidence.",
  },
};

export const CLIENT_VISIBLE_MILESTONES = ["printing", "packaging_qc", "delivered"];

/**
 * Milestone status in the client's words.
 *
 * `pending_pof` is the supplier not having filed evidence yet, `pof_attached`
 * is evidence filed, `released` is Operations having checked it. The middle
 * one is the honest "done, being checked" — not "done" outright.
 */
function statusMeta(status: string): {
  statusLabel: string;
  tone: OrderStatusTone;
  icon: OrderStatusIcon;
} {
  switch (status) {
    case "released":
      return { statusLabel: "Done and checked", tone: "success", icon: "circle-check" };
    case "pof_attached":
      return { statusLabel: "Done, with Operations", tone: "info", icon: "clock" };
    default:
      return { statusLabel: "Not started", tone: "neutral", icon: "clock" };
  }
}

/** The client-visible fulfilment steps for an order, in order. */
export function fulfilmentSteps(milestones: PayoutMilestone[] | undefined): FulfilmentStep[] {
  if (!milestones?.length) return [];
  const byCode = new Map(milestones.map((milestone) => [milestone.code, milestone]));

  return CLIENT_VISIBLE_MILESTONES.flatMap((code) => {
    const milestone = byCode.get(code);
    const copy = STEP_COPY[code];
    if (!milestone || !copy) return [];
    return [{ code, ...copy, ...statusMeta(milestone.status) }];
  });
}

/** "1 of 3 done" — the one-line summary above the list. */
export function fulfilmentSummary(steps: FulfilmentStep[]): string {
  if (!steps.length) return "Your supplier has not started this job yet.";
  const done = steps.filter((step) => step.statusLabel !== "Not started").length;
  if (done === 0) return "Your supplier has not filed anything on this job yet.";
  if (done === steps.length) return "Every step is done and evidenced.";
  return `${done} of ${steps.length} steps done.`;
}
