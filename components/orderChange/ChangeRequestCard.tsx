import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DateChange } from "@/components/DateChange";
import { DecisionChoice } from "@/components/DecisionChoice";
import { ErrorState } from "@/components/ErrorState";
import { QrTopUpForm } from "@/components/QrTopUpForm";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip, type StatusIconName, type StatusTone } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  DECLINE_CONFIRM,
  DECLINE_NOTE,
  approveNote,
  changeKindLabel,
  changePriceLine,
  type ChangeRequestView,
} from "@/lib/orderChanges";
import { formatTimelineStamp } from "@/lib/relativeTime";
import { useChangePayment } from "@/store/checkoutPayment";

type Props = {
  order: api.Order;
  view: ChangeRequestView;
  /** Holds the screen's one yellow control. */
  primary: boolean;
  /** Re-read the order after an answer; the order carries the request. */
  onChanged: () => void;
};

const CHIP: Record<ChangeRequestView["kind"], { tone: StatusTone; icon: StatusIconName; label: string }> = {
  answer: { tone: "warning", icon: "square-pen", label: "Waiting for your answer" },
  pay: { tone: "warning", icon: "clock", label: "Approved · not paid yet" },
  checking: { tone: "info", icon: "clock", label: "Payment being checked" },
};

/**
 * The shop asked to change the job after taking it (gridgo-api
 * `docs/ORDER_CHANGES_API.md`, report F9FCD485): what would change, why, and
 * what it costs, with the client's answer and — for a priced change — the QR
 * top-up that has to clear before the changed work starts.
 *
 * Drawn the way a docket is corrected: the note the client wrote stays on the
 * record and the shop's amendment is written under it on the same rail, so it
 * reads as one specification being marked up rather than two to compare.
 * Every state says what is in effect right now, because until the change is
 * agreed (and paid) the shop prints the order exactly as it was placed.
 */
export function ChangeRequestCard({ order, view, primary, onChanged }: Props) {
  const { change, itemName } = view;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const sending = useRef(false);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const priced = change.totalMinor > 0;

  const answer = async (choice: "accept" | "decline") => {
    if (sending.current) return;
    const input = { expectedVersion: change.version, answer: choice };
    const body = JSON.stringify(input);
    // A retry of the same answer reuses its key, so it is never filed twice.
    if (attempt.current?.body !== body) attempt.current = { body, key: api.newIdempotencyKey() };
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.answerOrderChange(order.id, change.id, input, attempt.current.key);
      attempt.current = null;
    } catch (caught) {
      setError(userFacingError(caught, "Your answer did not reach GRIDGO. Check your connection and try again."));
    } finally {
      sending.current = false;
      setBusy(false);
      setConfirmDecline(false);
      onChanged();
    }
  };

  const heading =
    view.kind === "answer"
      ? "The shop asks to change your order"
      : view.kind === "pay"
        ? `Pay ${formatPhp(change.totalMinor)} for your change`
        : "We are checking your payment for the change";
  const intro =
    view.kind === "answer"
      ? `${changeKindLabel(change)}${itemName ? ` for ${itemName}` : ""}. Until you answer, the shop prints your order as you placed it.`
      : view.kind === "pay"
        ? "You approved the change. The shop starts it only once Operations confirms this payment; until then it prints your order as you placed it."
        : "Operations is matching your transfer against GRIDGO's wallet. The shop prints your order as placed until they confirm it. Do not pay again.";

  return (
    <View className="gg-card gap-4" testID="change-request-card">
      <View className="gap-2">
        <View className="flex-row">
          <StatusChip tone={CHIP[view.kind].tone} icon={CHIP[view.kind].icon} label={CHIP[view.kind].label} />
        </View>
        <Text accessibilityRole="header" className="text-h2 text-text-primary">{heading}</Text>
        <Text className="text-body text-text-secondary">{intro}</Text>
      </View>

      {change.reason.trim() ? (
        <View className="gap-1 border-l-2 border-outline pl-3">
          <Text className="text-caption text-text-muted">Why the shop asks</Text>
          <Text className="text-body text-text-primary">{change.reason}</Text>
        </View>
      ) : null}

      <Amendment original={change.originalInstructions ?? ""} proposed={change.proposedSpec ?? ""} />

      {change.proposedPromiseBy ? (
        <DateChange next={change.proposedPromiseBy} previous={order.promiseBy} label="Ready by, with the change" />
      ) : null}

      <View
        className="flex-row items-baseline justify-between gap-4 border-t border-outline-subtle pt-3"
        accessible
        accessibilityLabel={`Cost of this change: ${changePriceLine(change)}`}
      >
        <Text className="text-body text-text-secondary">Cost of this change</Text>
        <Text className="text-h3 text-text-primary">{changePriceLine(change)}</Text>
      </View>
      {priced && view.kind === "answer" ? (
        <Text className="-mt-2 text-caption text-text-muted">
          Paid in full by QR before the change starts. Vouchers and discounts do not apply to a change.
        </Text>
      ) : null}

      {view.kind === "checking" && change.payment ? (
        <View className="gg-panel">
          <SpecRow label="Amount sent" value={formatPhp(change.totalMinor)} />
          <SpecRow label="Reference you sent" value={change.payment.reference} />
          <SpecRow label="Sent" value={formatTimelineStamp(change.payment.submittedAt)} />
        </View>
      ) : null}

      {view.kind === "pay" ? (
        <QrTopUpForm
          draftKey={`change:${order.id}:${change.id}`}
          draft={useChangePayment}
          amountMinor={change.totalMinor}
          rejectionReason={change.rejectionReason}
          paymentKind="change"
          afterConfirmed="The shop starts the change once Operations verifies the transfer."
          primary={primary}
          send={async (input, key) => {
            await api.submitOrderChangePayment(order.id, change.id, { expectedVersion: change.version, ...input }, key);
            onChanged();
          }}
          onConflict={onChanged}
        />
      ) : null}

      {error ? <ErrorState label="Not sent" body={error} /> : null}

      {view.kind === "answer" ? (
        <View className="gap-4">
          <DecisionChoice
            primary={primary}
            label={busy ? "Sending…" : "Approve the change"}
            note={approveNote(change)}
            disabled={busy}
            onPress={() => void answer("accept")}
          />
          <DecisionChoice
            label="Decline"
            note={DECLINE_NOTE}
            disabled={busy}
            onPress={() => setConfirmDecline(true)}
          />
        </View>
      ) : view.kind === "pay" ? (
        <QuietLink
          label="Decline and keep my order as placed"
          disabled={busy}
          onPress={() => setConfirmDecline(true)}
        />
      ) : null}

      <ConfirmDialog
        visible={confirmDecline}
        question={DECLINE_CONFIRM.question}
        body={DECLINE_CONFIRM.body}
        confirmLabel={DECLINE_CONFIRM.confirm}
        cancelLabel={DECLINE_CONFIRM.cancel}
        busy={busy}
        onCancel={() => { if (!busy) setConfirmDecline(false); }}
        onConfirm={() => void answer("decline")}
      />
    </View>
  );
}

/**
 * The client's note, and the shop's amendment written under it.
 *
 * The note is not struck through: it is what the client asked for and stays
 * on the record either way. A time-only request has no amendment and draws
 * nothing here.
 */
export function Amendment({ original, proposed, proposedLabel = "The shop proposes" }: {
  original: string;
  proposed: string;
  proposedLabel?: string;
}) {
  const colors = useThemeColors();
  const note = original.trim();
  const amendment = proposed.trim();
  if (!amendment) return null;
  return (
    <View
      accessible
      accessibilityLabel={`${note ? `Your note: ${note}. ` : ""}${proposedLabel}: ${amendment}.`}
      className="gg-panel flex-row gap-3"
    >
      {note ? (
        <View className="items-center pt-1.5" style={{ width: 12 }}>
          <View className="rounded-pill border-2 border-outline bg-surface-variant" style={{ width: 10, height: 10 }} />
          <View className="flex-1 bg-outline" style={{ width: 2, minHeight: 28 }} />
          <View className="rounded-pill" style={{ width: 12, height: 12, backgroundColor: colors.textPrimary }} />
        </View>
      ) : null}
      <View className="min-w-0 flex-1 gap-3">
        {note ? (
          <View className="gap-0.5">
            <Text className="text-caption text-text-muted">Your note</Text>
            <Text className="text-body text-text-secondary">{note}</Text>
          </View>
        ) : null}
        <View className="gap-0.5">
          <Text className="text-caption text-text-secondary">{proposedLabel}</Text>
          <Text className="text-body-lg font-medium text-text-primary">{amendment}</Text>
        </View>
      </View>
    </View>
  );
}

function QuietLink({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="gg-touch items-center justify-center"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Text className="text-center text-button text-text-primary underline">{label}</Text>
    </Pressable>
  );
}
