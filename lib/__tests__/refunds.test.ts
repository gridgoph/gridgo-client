import { presentNotification } from "@/lib/notificationPresentation";
import { orderNextAction, orderWaitingOn } from "@/lib/orderState";
import { balanceDue, collectionPaused, payableInstallment } from "@/lib/payment";
import {
  canReplaceDestination,
  canWithdrawRefund,
  checkRefundReason,
  currentRefund,
  destinationInput,
  missingDestination,
  refundBreakdown,
  refundEntry,
  refundHeadline,
  refundHistoryRow,
  refundNotificationCopy,
  refundRejectionReason,
  refundStageIndex,
  refundStatusMeta,
  ACTIVE_REFUND_STATUSES,
} from "@/lib/refunds";
import type { Notification } from "@/lib/api";
import { PARTIAL_SETTLEMENT, approvedRefund, refund, refundOrder } from "@/test/refundFixtures";

const NOW = new Date("2026-09-28T12:00:00+08:00").getTime();

describe("refundEntry", () => {
  it("offers a full refund of what was paid before printing starts", () => {
    const entry = refundEntry(
      refundOrder({ state: "payment_authorized", timeline: [] }),
      [],
      NOW,
    );
    expect(entry).toEqual({ kind: "eligible", deadlineAt: null, beforeProduction: true, paidMinor: 115000 });
  });

  it("knows printing started from the timeline or a released stage, not only the state", () => {
    expect(refundEntry(refundOrder(), [], NOW)).toMatchObject({ kind: "eligible", beforeProduction: false });
    expect(
      refundEntry(
        refundOrder({
          state: "approved_for_matching",
          timeline: [],
          payoutMilestones: [{ code: "printing", sharePercent: 40, status: "released", pofFileIds: [] }],
        }),
        [],
        NOW,
      ),
    ).toMatchObject({ kind: "eligible", beforeProduction: false });
  });

  it("bounds a delivered order by the recorded complaint deadline", () => {
    const delivered = refundOrder({
      state: "issue_window_open",
      issueWindowOpenedAt: "2026-09-28T09:00:00+08:00",
      issueWindowExpiresAt: "2026-09-29T09:00:00+08:00",
    });
    expect(refundEntry(delivered, [], NOW)).toMatchObject({
      kind: "eligible",
      deadlineAt: "2026-09-29T09:00:00+08:00",
    });
    // Equality with the deadline is late, as on the server.
    expect(refundEntry(delivered, [], new Date("2026-09-29T09:00:00+08:00"))).toEqual({ kind: "closed" });
  });

  it("closes once the client confirmed everything is fine", () => {
    const confirmed = refundOrder({
      state: "completed",
      issueWindowOpenedAt: "2026-09-28T09:00:00+08:00",
      issueWindowExpiresAt: "2026-09-29T09:00:00+08:00",
    });
    expect(refundEntry(confirmed, [], NOW)).toEqual({ kind: "closed" });
  });

  it("offers nothing without a confirmed payment", () => {
    const unpaid = refundOrder({
      payments: {
        initial: {
          amountMinor: 115000,
          method: "qr_manual",
          status: "pending_confirmation",
          reference: "X",
          submittedAt: null,
          confirmedAt: null,
        },
      },
    });
    expect(refundEntry(unpaid, [], NOW)).toEqual({ kind: "none" });
  });

  it("returns the open request instead of a second entry", () => {
    const open = refund({ status: "payment_unknown" });
    expect(refundEntry(refundOrder({ refundHold: true }), [open], NOW)).toEqual({ kind: "open", refund: open });
  });

  it("offers nothing on a cancelled order whose refund was settled", () => {
    const paid = approvedRefund({ status: "paid" });
    expect(refundEntry(refundOrder({ state: "cancelled" }), [paid], NOW)).toEqual({ kind: "none" });
  });

  it("lets a client ask again after withdrawing", () => {
    expect(refundEntry(refundOrder(), [refund({ status: "withdrawn" })], NOW)).toMatchObject({ kind: "eligible" });
  });
});

describe("currentRefund", () => {
  it("prefers the open request, else the newest", () => {
    const old = refund({ id: "a", status: "rejected", createdAt: "2026-09-27T10:00:00Z" });
    const newer = refund({ id: "b", status: "withdrawn", createdAt: "2026-09-28T10:00:00Z" });
    expect(currentRefund([old, newer])?.id).toBe("b");
    expect(currentRefund([refund({ id: "c", status: "approved" }), newer])?.id).toBe("c");
    expect(currentRefund([])).toBeNull();
  });
});

describe("refundBreakdown", () => {
  it("states Printing with the returned fee inside it, never the fee in pesos", () => {
    const breakdown = refundBreakdown(PARTIAL_SETTLEMENT, refundOrder());
    expect(breakdown.printingMinor).toBe(66000);
    expect(breakdown.deliveryMinor).toBe(5000);
    expect(breakdown.totalMinor).toBe(71000);
    // Printing + Delivery = Total.
    expect(breakdown.printingMinor + breakdown.deliveryMinor).toBe(breakdown.totalMinor);
    expect(breakdown.includesFee).toBe(true);
    const words = `${breakdown.scope} ${breakdown.kept}`;
    expect(words).not.toContain("₱60.00");
    expect(words).not.toContain("₱600.00");
  });

  it("calls a partial refund partial and says what was kept, in words", () => {
    const breakdown = refundBreakdown(PARTIAL_SETTLEMENT, refundOrder());
    expect(breakdown.full).toBe(false);
    expect(breakdown.scope).toBe("Partial refund · ₱710.00 of ₱1,150.00 paid");
    expect(breakdown.kept).toContain("printing work the shop had already done");
    expect(breakdown.kept).not.toContain("delivery");
  });

  it("keeps a completed delivery out of the refund and says so", () => {
    // After delivery and ₱750 released, the shop waives ₱250: ₱250 + ₱25 = ₱275.
    const breakdown = refundBreakdown(
      { ...PARTIAL_SETTLEMENT, principalMinor: 25000, feeMinor: 2500, deliveryMinor: 0, totalMinor: 27500 },
      refundOrder({ state: "completed" }),
    );
    expect(breakdown.printingMinor).toBe(27500);
    expect(breakdown.kept).toContain("the delivery trip that was made");
  });

  it("calls a refund of everything paid a full refund", () => {
    const breakdown = refundBreakdown(
      { ...PARTIAL_SETTLEMENT, principalMinor: 100000, feeMinor: 10000, deliveryMinor: 5000, totalMinor: 115000 },
      refundOrder(),
    );
    expect(breakdown.full).toBe(true);
    expect(breakdown.scope).toBe("Full refund — everything you paid");
    expect(breakdown.kept).toBeNull();
  });
});

describe("approval is not payment", () => {
  it("never labels an approved refund as refunded or sent", () => {
    for (const status of ["approved", "payment_in_progress", "payment_unknown", "destination_review"]) {
      const meta = refundStatusMeta(status);
      expect(meta.label).not.toMatch(/refunded|paid|^sent|was sent/i);
      expect(meta.icon).not.toBe("circle-check");
      expect(refundHeadline(approvedRefund({ status })).headline).not.toMatch(/was sent|refunded/i);
    }
    expect(refundStatusMeta("paid")).toEqual({ label: "Refunded", tone: "success", icon: "circle-check" });
  });

  it("puts approved and sent on separate stops", () => {
    expect(refundStageIndex("approved")).toBe(2);
    expect(refundStageIndex("payment_unknown")).toBe(2);
    expect(refundStageIndex("paid")).toBe(3);
    expect(refundStageIndex("rejected")).toBeNull();
  });

  it("explains an unknown transfer without promising a second send", () => {
    const { detail } = refundHeadline(approvedRefund({ status: "payment_unknown" }));
    expect(detail).toContain("never sent twice");
  });

  it("does not crash on a status added later", () => {
    expect(refundStatusMeta("on_hold").label).toBe("Refund updated");
    expect(refundHeadline(refund({ status: "on_hold" })).headline).toBe("Your refund was updated");
  });
});

describe("history and decisions", () => {
  it("labels events in the client's words and never repeats wallet working notes", () => {
    expect(refundHistoryRow({ kind: "attempt", at: "x" })).toEqual({ label: "Operations started the transfer", at: "x" });
    expect(refundHistoryRow({ kind: "settled", at: "x" }).label).toBe("Refund approved — not sent yet");
    expect(refundHistoryRow({ kind: "something_new", at: "x" }).label).toBe("Refund updated");
  });

  it("reads the rejection reason from the history", () => {
    const rejected = refund({
      status: "rejected",
      history: [
        { kind: "requested", reason: "r", at: "a" },
        { kind: "rejected", reason: "The job was already delivered as agreed.", at: "b" },
      ],
    });
    expect(refundRejectionReason(rejected)).toBe("The job was already delivered as agreed.");
    expect(refundRejectionReason(refund())).toBeNull();
  });

  it("allows withdrawing only before settlement and changing the QR only before a transfer", () => {
    expect(canWithdrawRefund(refund({ status: "reviewed" }))).toBe(true);
    expect(canWithdrawRefund(approvedRefund())).toBe(false);
    expect(canReplaceDestination(approvedRefund())).toBe(true);
    expect(canReplaceDestination(approvedRefund({ status: "payment_in_progress" }))).toBe(false);
    expect(canReplaceDestination(approvedRefund({ status: "payment_unknown" }))).toBe(false);
  });
});

describe("the receiving account", () => {
  const complete = { qrFileId: "file_qr", provider: "gcash" as const, accountName: "  Ana Santos ", ownershipConfirmed: true };

  it("names the first thing missing", () => {
    expect(missingDestination({ ...complete, qrFileId: null })).toBe("Upload your receiving QR.");
    expect(missingDestination({ ...complete, provider: null })).toBe("Choose which wallet the QR is for.");
    expect(missingDestination({ ...complete, accountName: " " })).toBe("Enter the name on the receiving account.");
    expect(missingDestination({ ...complete, ownershipConfirmed: false })).toBe("Confirm the account is your own.");
    expect(missingDestination(complete)).toBeNull();
  });

  it("sends the attested destination the API expects", () => {
    expect(destinationInput(complete)).toEqual({
      qrFileId: "file_qr",
      provider: "gcash",
      accountName: "Ana Santos",
      ownershipConfirmed: true,
    });
    expect(destinationInput({ ...complete, ownershipConfirmed: false })).toBeNull();
  });

  it("asks for a reason Operations can act on", () => {
    expect(checkRefundReason("")).toMatch(/Say why/);
    expect(checkRefundReason("too short")).toMatch(/at least 15/);
    expect(checkRefundReason("The shop cannot finish this by Friday.")).toBeNull();
  });
});

describe("collection pauses for a refund", () => {
  const legacy = refundOrder({
    state: "ready_for_dispatch",
    downpaymentPercent: 75,
    downpaymentMinor: 86250,
    balanceMinor: 28750,
    payments: {
      downpayment: { amountMinor: 86250, method: "qr_manual", status: "confirmed", reference: "A", submittedAt: null, confirmedAt: null },
      balance: { amountMinor: 28750, method: "qr_manual", status: "not_submitted", reference: null, submittedAt: null, confirmedAt: null },
    },
  });

  it("asks for the balance normally", () => {
    expect(balanceDue(legacy)).toBe(true);
  });

  it("stops asking while a refund is open, and after it cancelled the unpaid balance", () => {
    expect(collectionPaused(legacy)).toBe(false);
    for (const paused of [{ ...legacy, refundHold: true }, { ...legacy, unpaidBalanceCancelled: true }]) {
      expect(collectionPaused(paused)).toBe(true);
      expect(balanceDue(paused)).toBe(false);
      expect(payableInstallment(paused)).toBeNull();
      expect(orderNextAction(paused)?.title ?? "").not.toMatch(/pay/i);
    }
  });

  it("asks nothing of the client while the job is paused, and says why", () => {
    const held = refundOrder({ state: "proof_approval", refundHold: true });
    expect(orderNextAction(held)).toBeNull();
    expect(orderWaitingOn(held)).toMatch(/paused while Operations reviews your refund/);
  });
});

describe("refund notifications", () => {
  it("has client copy for every event the API sends the client", () => {
    for (const kind of ["requested", "reviewed", "destination", "settled", "attempt", "unknown", "failed", "paid", "rejected", "withdrawn"]) {
      expect(refundNotificationCopy(`refund_${kind}`)).not.toBeNull();
    }
    expect(refundNotificationCopy("refund_supplier_paid")).toBeNull();
    expect(refundNotificationCopy("refund_settled")?.title).toBe("Refund approved — not sent yet");
  });

  it("replaces the server wording on the inbox card", () => {
    const presented = presentNotification({
      id: "n1",
      userId: "user_client",
      orderId: "ord_refund_1",
      type: "refund_paid",
      title: "Client refund",
      body: "The client refund transfer was recorded.",
      read: false,
      at: "2026-09-28T12:00:00+08:00",
      orderState: "cancelled",
    } as Notification);
    expect(presented.title).toBe("Refund sent");
    expect(presented.body).not.toContain("client refund");
  });
});

it("keeps the active list in step with gridgo-api", () => {
  expect([...ACTIVE_REFUND_STATUSES]).toEqual([
    "requested",
    "reviewed",
    "approved",
    "destination_review",
    "payment_in_progress",
    "payment_unknown",
  ]);
});
