/**
 * Client refunds under the available-funds policy (`available_funds_v1`).
 *
 * Contract: `docs/REFUNDS_API.md` in gridgo-api. Three rules shape every
 * sentence below, and each has already been broken somewhere else in the app:
 *
 * - **Approved is not paid.** Operations approves an amount, then sends it by
 *   hand from GRIDGO's wallet to the client's own receiving QR and records the
 *   transfer. Nothing reads as refunded until `status` is `paid`.
 * - **The screenshot is transfer evidence, never an "official receipt".**
 * - **GRIDGO's cut never appears in pesos.** A refund returns part of the
 *   service fee along with the printing; the client reads the two as one
 *   Printing figure, the same way checkout and the receipt state it.
 *
 * Money already paid to a shop or a rider is never taken back, so after
 * printing starts a refund can be partial. The copy says what is kept and why
 * in words, never as the shop's figure.
 */

import type {
  Order,
  Refund,
  RefundDestinationInput,
  RefundKind,
  RefundProvider,
  RefundSettlement,
} from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { formatDeadline } from "@/lib/deadline";
import type { OrderStateMeta } from "@/lib/orderState";
import { orderPrintingMinor } from "@/lib/serviceFee";

/** Statuses during which the order is paused for the refund. */
export const ACTIVE_REFUND_STATUSES = [
  "requested",
  "reviewed",
  "approved",
  "destination_review",
  "payment_in_progress",
  "payment_unknown",
] as const;

export function isRefundActive(refund: Pick<Refund, "status">): boolean {
  return (ACTIVE_REFUND_STATUSES as readonly string[]).includes(refund.status);
}

/** The refund worth showing on an order: the open one, else the newest. */
export function currentRefund(refunds: Refund[] | null | undefined): Refund | null {
  if (!Array.isArray(refunds) || refunds.length === 0) return null;
  const open = refunds.find(isRefundActive);
  if (open) return open;
  return [...refunds].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/** What the client actually paid and Operations confirmed. */
export function confirmedPaidMinor(order: Pick<Order, "payments">): number {
  return Object.values(order.payments ?? {}).reduce(
    (sum, installment) =>
      installment?.status === "confirmed" && installment.amountMinor != null
        ? sum + installment.amountMinor
        : sum,
    0,
  );
}

const HANDOVER_STATES = ["delivered", "issue_window_open", "completed", "payout_released"];
const PRODUCTION_STATES = [
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "awaiting_collection",
  ...HANDOVER_STATES,
];

/** The order reached the client. Filing is then bounded by the complaint deadline. */
export function handoverCompleted(order: Pick<Order, "state" | "timeline" | "issueWindowOpenedAt">): boolean {
  return (
    Boolean(order.issueWindowOpenedAt) ||
    HANDOVER_STATES.includes(order.state) ||
    (order.timeline ?? []).some((event) => event.state === "delivered")
  );
}

/** Printing has started, so the shop may already have earned part of the price. */
export function productionStarted(order: Pick<Order, "state" | "timeline">): boolean {
  return (
    PRODUCTION_STATES.includes(order.state) ||
    (order.timeline ?? []).some((event) => PRODUCTION_STATES.includes(event.state))
  );
}

export type RefundEntry =
  /** A request is open: only one may be open per order. */
  | { kind: "open"; refund: Refund }
  /** The client may ask now. `deadlineAt` is null before handover. */
  | { kind: "eligible"; deadlineAt: string | null; beforeProduction: boolean; paidMinor: number }
  /** They could have asked, and the time to ask from the app has passed. */
  | { kind: "closed" }
  /** Nothing to refund: no confirmed payment, or already refunded. */
  | { kind: "none" };

/**
 * Whether the order offers "Request a refund", read the way gridgo-api
 * decides it (`lateFiling` in `src/refunds.js`). The server still has the last
 * word — this only keeps a client from walking into a refusal.
 */
export function refundEntry(
  order: Order,
  refunds: Refund[] | null | undefined,
  now: Date | number = Date.now(),
): RefundEntry {
  const open = (refunds ?? []).find(isRefundActive);
  if (open) return { kind: "open", refund: open };
  const paidMinor = confirmedPaidMinor(order);
  const settled = (refunds ?? []).some((refund) => refund.settlement != null);
  // A cancelled order whose refund was settled has nothing left to return.
  if (paidMinor <= 0 || (settled && order.state === "cancelled")) return { kind: "none" };

  if (handoverCompleted(order)) {
    const nowMs = typeof now === "number" ? now : now.getTime();
    const expiresMs = order.issueWindowExpiresAt ? new Date(order.issueWindowExpiresAt).getTime() : NaN;
    const signedOff = ["completed", "payout_released"].includes(order.state) && !settled;
    if (signedOff || !Number.isFinite(expiresMs) || nowMs >= expiresMs) return { kind: "closed" };
    return { kind: "eligible", deadlineAt: order.issueWindowExpiresAt ?? null, beforeProduction: false, paidMinor };
  }
  return { kind: "eligible", deadlineAt: null, beforeProduction: !productionStarted(order), paidMinor };
}

/** The one line under "Request a refund" on the order screen. */
export function refundEntryNote(entry: Extract<RefundEntry, { kind: "eligible" }>): string {
  if (entry.deadlineAt) {
    return `You can ask until ${formatDeadline(entry.deadlineAt)}. Telling GRIDGO everything is fine closes this sooner.`;
  }
  return entry.beforeProduction
    ? `Printing has not started, so everything you paid — ${formatPhp(entry.paidMinor)} — comes back.`
    : "Printing has started. Operations returns what has not been spent on work already done.";
}

/** What asking does, said before the client commits to it. */
export function refundPolicyCopy(entry: Extract<RefundEntry, { kind: "eligible" }>): {
  headline: string;
  points: string[];
} {
  const points = entry.beforeProduction
    ? [
        `Printing has not started, so everything you paid comes back: ${formatPhp(entry.paidMinor)}.`,
        "The job pauses the moment you send this, so nothing is printed while Operations checks it.",
      ]
    : [
        "Printing has started. Operations agrees with the shop what work is already done, and returns the rest of what you paid — including delivery if no trip was made.",
        "Work already paid for is not taken back from the shop or the rider, so the amount can be less than you paid. You see the amount before anything is sent.",
        "The job pauses while Operations reviews this.",
      ];
  if (entry.deadlineAt) {
    points.push(
      `You can ask until ${formatDeadline(entry.deadlineAt)}. A request sent in time is still decided after that. Telling GRIDGO everything is fine ends the time to ask early.`,
    );
  }
  return {
    headline: entry.beforeProduction ? "You get everything back" : "What you can get back",
    points,
  };
}

export const REFUND_CLOSED_COPY =
  "The time to ask for a refund in the app has passed — it ends when the check window closes or when you confirm everything is fine. Message GRIDGO support if something is still wrong.";

/** Same shape as an order state's chip: icon + label + tone, never colour alone. */
export type RefundStatusMeta = OrderStateMeta;

const STATUS_META: Record<string, RefundStatusMeta> = {
  requested: { label: "Refund requested", tone: "info", icon: "clock" },
  reviewed: { label: "Being decided", tone: "info", icon: "clock" },
  destination_review: { label: "New account being checked", tone: "warning", icon: "square-pen" },
  // A clock, not a tick: approved money has not moved yet.
  approved: { label: "Approved · not sent yet", tone: "info", icon: "clock" },
  payment_in_progress: { label: "Being sent", tone: "info", icon: "clock" },
  payment_unknown: { label: "Checking the transfer", tone: "warning", icon: "triangle-alert" },
  paid: { label: "Refunded", tone: "success", icon: "circle-check" },
  rejected: { label: "Not approved", tone: "error", icon: "circle-x" },
  withdrawn: { label: "Withdrawn", tone: "neutral", icon: "circle-x" },
};

export function refundStatusMeta(status: string): RefundStatusMeta {
  return STATUS_META[status] ?? { label: "Refund updated", tone: "neutral", icon: "clock" };
}

const PROVIDER_LABELS: Record<string, string> = {
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank",
  other: "Other wallet",
};

export function refundProviderLabel(provider: string | null | undefined): string {
  return (provider && PROVIDER_LABELS[provider]) || "Wallet";
}

export const REFUND_PROVIDERS: { value: RefundProvider; label: string; hint: string }[] = [
  { value: "gcash", label: "GCash", hint: "Your GCash QR from Receive money" },
  { value: "maya", label: "Maya", hint: "Your Maya QR from Receive money" },
  { value: "bank", label: "Bank", hint: "A bank app's receiving QR (InstaPay)" },
  { value: "other", label: "Other wallet", hint: "Any other InstaPay receiving QR" },
];

export const REFUND_KINDS: { value: RefundKind; label: string; hint: string }[] = [
  { value: "cancellation", label: "Cancel this order", hint: "You no longer want it, or it cannot be done" },
  { value: "complaint", label: "Something is wrong with it", hint: "Late, damaged, wrong, or not what was agreed" },
];

/** An example reason in the client's own voice, fitted to what they are asking. */
export function refundReasonPlaceholder(kind: string | null): string {
  return kind === "complaint"
    ? "The flyers arrived with the brand red printed orange across all 200."
    : "We moved the event to next month, so we no longer need these.";
}

export function refundKindLabel(kind: string): string {
  return REFUND_KINDS.find((option) => option.value === kind)?.label ?? "Refund request";
}

/** "Where your refund is" — one headline and what happens next, per status. */
export function refundHeadline(refund: Refund): { headline: string; detail: string } {
  const account = refund.destination
    ? `your ${refundProviderLabel(refund.destination.provider)} account`
    : "your receiving account";
  const amount = refund.settlement ? formatPhp(refund.settlement.totalMinor) : null;
  switch (refund.status) {
    case "requested":
      return {
        headline: "Your refund request is with Operations",
        detail: refund.destination
          ? "The job is paused while they check your request and receiving account. You get a notification when they decide."
          : "The job is paused while they check your request. Add your receiving QR so they can send the money once it is approved.",
      };
    case "reviewed":
      return {
        headline: "Operations is working out your refund",
        detail: refund.beforeProduction
          ? "Your request and receiving account are checked. They approve the refund once the job is fully stopped."
          : "Your request and receiving account are checked. They are agreeing with the shop what work is already done before they approve an amount.",
      };
    case "destination_review":
      return {
        headline: "Operations is checking your new account",
        detail: `Your refund${amount ? ` of ${amount}` : ""} stays approved. It is sent once they have checked the receiving QR you changed to.`,
      };
    case "approved":
      return {
        headline: `${amount ?? "Your refund"} is approved — not sent yet`,
        detail: `Operations sends it by hand from GRIDGO's wallet to ${account}. It shows as Refunded here once they record the transfer.`,
      };
    case "payment_in_progress":
      return {
        headline: `${amount ?? "Your refund"} is being sent`,
        detail: `Operations is sending it to ${account} now. It shows as Refunded once they record the transfer.`,
      };
    case "payment_unknown":
      return {
        headline: "Operations is checking whether the transfer went through",
        detail: `A transfer was started but its result is not confirmed. They check GRIDGO's wallet history before doing anything else, so the refund is never sent twice. If it has already reached ${account}, it shows here once recorded.`,
      };
    case "paid":
      return {
        headline: `${refund.payment ? formatPhp(refund.payment.amountMinor) : amount ?? "Your refund"} was sent to ${account}`,
        detail: "Operations recorded the transfer. Check your wallet for it; the transfer evidence is below.",
      };
    case "rejected":
      return {
        headline: "Operations did not approve this refund",
        detail: "Their reason is below. Message GRIDGO support if you want to talk it through.",
      };
    case "withdrawn":
      return {
        headline: "You withdrew this request",
        detail: "Nothing was refunded, and the job carries on as it was.",
      };
    default:
      return {
        headline: "Your refund was updated",
        detail: "Pull down to refresh, or message GRIDGO support.",
      };
  }
}

/**
 * The four stops, named. Approved and Sent are separate on purpose: the gap
 * between them is exactly the one a client must never mistake for payment.
 */
export const REFUND_STAGES = ["Requested", "Reviewed", "Approved", "Sent"] as const;

/** Index into {@link REFUND_STAGES}, or null for a request that left the path. */
export function refundStageIndex(status: string): number | null {
  switch (status) {
    case "requested":
      return 0;
    case "reviewed":
    case "destination_review":
      return 1;
    case "approved":
    case "payment_in_progress":
    case "payment_unknown":
      return 2;
    case "paid":
      return 3;
    default:
      return null;
  }
}

export type RefundBreakdown = {
  printingMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  /** Whether the service-fee explainer belongs beside it (never an amount). */
  includesFee: boolean;
  full: boolean;
  /** "Full refund" / "Partial refund · ₱710.00 of ₱1,150.00 paid". */
  scope: string;
  /** What was kept and why, in words. Null for a full refund. */
  kept: string | null;
};

/**
 * The approved amount as the client reads it: Printing (with the returned
 * service fee inside it), Delivery, Total — Printing + Delivery = Total, the
 * same shape as the order's own money card.
 */
export function refundBreakdown(
  settlement: RefundSettlement,
  order: Pick<
    Order,
    "payments" | "subtotalMinor" | "serviceFeeMinor" | "deliveryFeeMinor" | "totalMinor" | "fulfillmentMode"
  >,
): RefundBreakdown {
  const paidMinor = confirmedPaidMinor(order);
  const printing = settlement.principalMinor + settlement.feeMinor;
  const full = paidMinor > 0 && settlement.totalMinor >= paidMinor;
  const chargedPrinting = orderPrintingMinor(order);
  const keptParts: string[] = [];
  if (!full) {
    if (chargedPrinting == null || printing < chargedPrinting) keptParts.push("printing work the shop had already done");
    // A new pick-up order's hub fee rides in the same slot; a legacy one is 0.
    const deliveryFee = order.deliveryFeeMinor ?? 0;
    if (deliveryFee > 0 && settlement.deliveryMinor < deliveryFee) keptParts.push("the delivery trip that was made");
  }
  return {
    printingMinor: printing,
    deliveryMinor: settlement.deliveryMinor,
    totalMinor: settlement.totalMinor,
    includesFee: settlement.feeMinor > 0,
    full,
    scope: full
      ? "Full refund — everything you paid"
      : paidMinor > 0
        ? `Partial refund · ${formatPhp(settlement.totalMinor)} of ${formatPhp(paidMinor)} paid`
        : "Partial refund",
    kept: full
      ? null
      : `The rest pays for ${keptParts.length ? keptParts.join(" and ") : "work already done"}.`,
  };
}

const HISTORY_LABELS: Record<string, string> = {
  requested: "You asked for a refund",
  reviewed: "Operations checked your request and account",
  destination: "You changed your receiving account",
  settled: "Refund approved — not sent yet",
  attempt: "Operations started the transfer",
  unknown: "Transfer result being checked",
  failed: "Transfer did not go through — nothing was sent",
  paid: "Refund sent",
  rejected: "Not approved",
  withdrawn: "You withdrew the request",
};

/**
 * One line of the refund's history, in the client's words. Event notes are
 * not repeated here: a decision's note has its own section on the screen, and
 * the rest are Operations' working notes about GRIDGO's own wallet.
 */
export function refundHistoryRow(entry: { kind: string; at: string }): { label: string; at: string } {
  return { label: HISTORY_LABELS[entry.kind] ?? "Refund updated", at: entry.at };
}

/** Operations' written reason for turning the request down. */
export function refundRejectionReason(refund: Refund): string | null {
  if (refund.status !== "rejected") return null;
  const entry = [...refund.history].reverse().find((row) => row.kind === "rejected");
  return entry?.reason?.trim() || null;
}

/** Withdrawing is only possible before Operations settles an amount. */
export function canWithdrawRefund(refund: Refund): boolean {
  return refund.status === "requested" || refund.status === "reviewed";
}

/** A receiving QR can change until a transfer is started. */
export function canReplaceDestination(refund: Refund): boolean {
  return ["requested", "reviewed", "approved", "destination_review"].includes(refund.status);
}

export const MIN_REFUND_REASON = 15;
export const MAX_REFUND_REASON = 2000;
export const MAX_ACCOUNT_NAME = 120;
export const MAX_REFUND_EVIDENCE = 10;
export const REFUND_QR_MAX_MIB = 5;
export const REFUND_EVIDENCE_MAX_MIB = 15;

export function checkRefundReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return "Say why you want a refund. Operations decides on what you write here.";
  if (trimmed.length < MIN_REFUND_REASON) {
    return `Add a little more detail — at least ${MIN_REFUND_REASON} characters.`;
  }
  if (trimmed.length > MAX_REFUND_REASON) return `Keep it under ${MAX_REFUND_REASON} characters.`;
  return null;
}

export type DestinationDraft = {
  qrFileId: string | null;
  provider: RefundProvider | null;
  accountName: string;
  ownershipConfirmed: boolean;
};

/** The first thing still missing from the receiving account, or null. */
export function missingDestination(draft: DestinationDraft): string | null {
  if (!draft.qrFileId) return "Upload your receiving QR.";
  if (!draft.provider) return "Choose which wallet the QR is for.";
  const name = draft.accountName.trim();
  if (!name) return "Enter the name on the receiving account.";
  if (name.length > MAX_ACCOUNT_NAME) return `Keep the account name under ${MAX_ACCOUNT_NAME} characters.`;
  if (!draft.ownershipConfirmed) return "Confirm the account is your own.";
  return null;
}

export function destinationInput(draft: DestinationDraft): RefundDestinationInput | null {
  if (missingDestination(draft) || !draft.qrFileId || !draft.provider) return null;
  return {
    qrFileId: draft.qrFileId,
    provider: draft.provider,
    accountName: draft.accountName.trim(),
    ownershipConfirmed: true,
  };
}

/** Inbox copy for `refund_*` notifications, in the client's terms. */
export function refundNotificationCopy(type: string | null | undefined): { title: string; body: string } | null {
  switch (type) {
    case "refund_requested":
      return { title: "Refund requested", body: "Operations has your request. The job is paused while they review it." };
    case "refund_reviewed":
      return { title: "Refund request checked", body: "Operations checked your request and receiving account." };
    case "refund_destination":
      return { title: "Receiving account changed", body: "Operations checks your new receiving QR before sending anything." };
    case "refund_settled":
      return { title: "Refund approved — not sent yet", body: "Open it for the amount. It shows as Refunded once the transfer is recorded." };
    case "refund_attempt":
      return { title: "Refund being sent", body: "Operations is sending your refund to your receiving account." };
    case "refund_unknown":
      return { title: "Checking your refund transfer", body: "Operations is confirming whether the transfer went through. It will not be sent twice." };
    case "refund_failed":
      return { title: "Refund transfer did not go through", body: "Nothing was sent. Your refund stays approved and Operations sends it again." };
    case "refund_paid":
      return { title: "Refund sent", body: "Operations recorded the transfer to your receiving account. Open it for the transfer evidence." };
    case "refund_rejected":
      return { title: "Refund not approved", body: "Open the request for Operations' reason." };
    case "refund_withdrawn":
      return { title: "Refund request withdrawn", body: "Nothing was refunded, and the job carries on." };
    default:
      return null;
  }
}
