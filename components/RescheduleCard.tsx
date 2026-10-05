import { useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DateChange } from "@/components/DateChange";
import { DecisionChoice } from "@/components/DecisionChoice";
import { ErrorState } from "@/components/ErrorState";
import { StatusChip } from "@/components/StatusChip";
import type { Order } from "@/lib/api";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { readyByDate } from "@/lib/readyTime";
import {
  RESCHEDULE_DECLINE_CONFIRM,
  RESCHEDULE_HEADLINE,
  holdUntilTime,
  timeLeftLabel,
  windowRemaining,
  type RescheduleView,
} from "@/lib/reschedule";
import { shopRecoveryRefundNote } from "@/lib/shopRecovery";

type Props = {
  order: Order;
  view: RescheduleView;
  /** Re-read the order after a choice; the order carries the request. */
  onChanged: () => void;
};

/** Re-renders every half minute, so the answer window counts down on screen. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const REMATCH_NOTE = "Same item, same specs, same price. The new shop confirms the job, then printing starts.";

/**
 * The shop asked for a later date (gridgo-supplier#101), and everything that
 * follows from the client's answer: the request itself with its 24-hour
 * window, the other shop GRIDGO finds after a decline, the refund as the last
 * resort, and the cases that go to Operations — which say so plainly.
 */
export function RescheduleCard({ order, view, onChanged }: Props) {
  const router = useRouter();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"decline" | "refund" | null>(null);
  const refundKey = useRef<string | null>(null);
  const request = view.request;

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(userFacingError(caught, fallback));
    } finally {
      setConfirm(null);
      setBusy(false);
      onChanged();
    }
  };

  const answer = (choice: "accept" | "decline") =>
    run(
      () => api.answerReschedule(order.id, request.id, choice),
      "Your answer did not go through. Check your connection and try again.",
    );

  const checkAgain = () =>
    run(
      () => api.rematchReschedule(order.id, { requestId: request.id, action: "refresh" }),
      "GRIDGO could not check again just now. Try again in a moment.",
    );

  const acceptShop = (offerId: string) =>
    run(
      () => api.rematchReschedule(order.id, { requestId: request.id, action: "accept", offerId }),
      "Your choice did not go through. Check your connection and try again.",
    );

  const refund = () =>
    run(async () => {
      refundKey.current ??= api.newIdempotencyKey();
      const updated = await api.refundReschedule(order.id, request.id, refundKey.current);
      refundKey.current = null;
      if (updated.refundRequestId) {
        router.push({
          pathname: "/order/refund",
          params: { orderId: order.id, refundId: updated.refundRequestId },
        });
      }
    }, "The refund was not requested. Check your connection and try again.");

  const refundNote = shopRecoveryRefundNote(order);
  const refundChoice = (primary: boolean, label = "Get a full refund instead", prefix = "") =>
    request.canRequestRefund ? (
      <DecisionChoice
        primary={primary}
        label={primary ? "Get a full refund" : label}
        note={`${prefix}${refundNote}`}
        disabled={busy}
        onPress={() => setConfirm("refund")}
      />
    ) : null;

  if (view.kind === "expired") {
    return (
      <View className="gg-panel gap-2">
        <Text accessibilityRole="header" className="text-body-lg font-medium text-text-primary">
          The time to answer passed
        </Text>
        <Text className="text-body text-text-secondary">
          Your shop asked for more time, and the 24 hours to answer ran out. Your original ready date
          {readyByDate(request.originalPromiseBy) ? `, ${readyByDate(request.originalPromiseBy)},` : ""} still
          applies. Operations will contact you about it.
        </Text>
      </View>
    );
  }

  let heading: string;
  let body: string;
  let content: ReactNode = null;
  let choices: ReactNode;

  switch (view.kind) {
    case "answer": {
      const closes = readyByDate(request.expiresAt);
      const remaining = windowRemaining(request, now);
      heading = RESCHEDULE_HEADLINE;
      body = "Something changed on their side, and they need a later date to finish this job well.";
      content = (
        <>
          {request.reason.trim() ? (
            <View className="gap-1 border-l-2 border-outline pl-3">
              <Text className="text-caption text-text-muted">Their reason</Text>
              <Text className="text-body text-text-primary">{request.reason}</Text>
            </View>
          ) : null}
          <DateChange next={view.proposed} previous={view.original} label="Proposed ready date" />
          <View className="gap-2">
            <Text className="text-body font-medium text-text-primary">
              {timeLeftLabel(request.expiresAt, now)} to answer
            </Text>
            <View
              className="h-1 overflow-hidden rounded-pill bg-surface-variant"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View className="h-1 rounded-pill bg-accent" style={{ width: `${Math.round(remaining * 100)}%` }} />
            </View>
            <Text className="text-caption text-text-muted">
              {closes ? `Answer by ${closes}. ` : ""}If you do not, your original date stays and Operations will
              contact you.
            </Text>
          </View>
        </>
      );
      choices = (
        <>
          <DecisionChoice
            primary
            label="Accept the new date"
            note="The same shop carries on, and the new date becomes your ready date."
            disabled={busy}
            onPress={() => void answer("accept")}
          />
          <DecisionChoice
            label="Decline"
            note="Work stops while GRIDGO looks for another shop for the same item and price. If none can take it, you can get a full refund."
            disabled={busy}
            onPress={() => setConfirm("decline")}
          />
        </>
      );
      break;
    }
    case "offer": {
      heading = "Another shop can print it";
      body = "You declined the new date, so GRIDGO looked again. This shop prints the same item, to the same specs, at the same price.";
      content = (
        <>
          <DateChange next={view.promiseBy} previous={request.originalPromiseBy} />
          <Text className="text-caption text-text-muted">
            GRIDGO holds this offer for you until {holdUntilTime(view.expiresAt)} ({timeLeftLabel(view.expiresAt, now)}).
          </Text>
        </>
      );
      choices = (
        <>
          <DecisionChoice
            primary
            label="Accept the new shop"
            note={REMATCH_NOTE}
            disabled={busy}
            onPress={() => void acceptShop(view.offerId)}
          />
          {refundChoice(false)}
        </>
      );
      break;
    }
    case "offer_expired":
      heading = "That offer has run out";
      body = "GRIDGO holds another shop's offer for 15 minutes. Check again to see which shops are free now.";
      choices = (
        <>
          <DecisionChoice
            primary
            label="Check again"
            note="GRIDGO looks for a shop that can print the same item at the same price by your date."
            disabled={busy}
            onPress={() => void checkAgain()}
          />
          {refundChoice(false)}
        </>
      );
      break;
    case "no_match":
      heading = "No other shop can take it in time";
      body = "You declined the new date, and no other shop can print this exactly as ordered by your date right now.";
      choices = (
        <>
          {refundChoice(true)}
          <DecisionChoice
            primary={!request.canRequestRefund}
            label="Check again"
            note="Shops free up during the day. Or wait: Operations will contact you."
            disabled={busy}
            onPress={() => void checkAgain()}
          />
        </>
      );
      break;
    case "operations":
    default:
      heading = "Operations will contact you";
      body = "Your shop asked for more time, and this one needs a person to settle it with you and the shop. Your order's dates stay as they are until then.";
      choices = refundChoice(false, "Get a full refund", "Prefer not to wait? ");
      break;
  }

  return (
    <View className="gap-5">
      <View className="gap-2">
        {view.kind === "answer" ? (
          <View className="flex-row">
            <StatusChip tone="warning" icon="clock" label="Your answer needed" />
          </View>
        ) : null}
        <Text accessibilityRole="header" className="text-h2 text-text-primary">
          {heading}
        </Text>
        <Text className="text-body text-text-secondary">{body}</Text>
      </View>

      {content}

      {error ? <ErrorState label="Not done" body={error} /> : null}

      {choices ? <View className="gap-4">{choices}</View> : null}

      <ConfirmDialog
        visible={confirm === "decline"}
        question={RESCHEDULE_DECLINE_CONFIRM.question}
        body={RESCHEDULE_DECLINE_CONFIRM.body}
        confirmLabel={RESCHEDULE_DECLINE_CONFIRM.confirmLabel}
        cancelLabel={RESCHEDULE_DECLINE_CONFIRM.cancelLabel}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void answer("decline")}
      />
      <ConfirmDialog
        visible={confirm === "refund"}
        question="Cancel this order for a full refund?"
        body={`${refundNote} This cannot be undone.`}
        confirmLabel="Get a full refund"
        cancelLabel="Go back"
        tone="destructive"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void refund()}
      />
    </View>
  );
}
