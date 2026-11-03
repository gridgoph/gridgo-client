import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DateChange } from "@/components/DateChange";
import { DecisionChoice } from "@/components/DecisionChoice";
import { ErrorState } from "@/components/ErrorState";
import { QrTopUpForm } from "@/components/QrTopUpForm";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import type { Order, ShopMovePricing } from "@/lib/api";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { formatTimelineStamp } from "@/lib/relativeTime";
import {
  acceptChoice,
  alternativeLabel,
  alternativeNote,
  payTheRestNote,
  priceComparison,
  shopRecoveryAcceptNote,
  shopRecoveryHeadline,
  shopRecoveryRefundNote,
  topUpChecking,
  type ShopRecoveryView,
} from "@/lib/shopRecovery";
import { useChangePayment } from "@/store/checkoutPayment";

type Props = {
  order: Order;
  view: ShopRecoveryView;
  /** Re-read the order after a choice; the response is not the whole order. */
  onChanged: () => void;
};

/** A refreshed offer or a changed amount: the server re-checked and drew it again. */
const OFFER_CHANGED = ["shop_recovery_offer_changed", "shop_move_top_up_consent_required"];

/**
 * The shop on this order could not take it (gridgo-supplier#102), or
 * Operations moved it. One decision, every answer on screen with what it does
 * next: the shop GRIDGO found, with its own ready date and — when the move was
 * not the client's doing (gridgo-api#225) — what it costs them against what
 * they already pay, or a full refund. Above GRIDGO's cover there are three
 * answers: pay the rest, pick another offered shop, or the refund.
 *
 * Accepting is one tap: the date, the price and the terms are already in
 * front of them, and the server re-checks the offer and shows a changed one
 * again rather than taking it. The refund asks first, because it ends the
 * order.
 */
export function ShopRecoveryCard({ order, view, onChanged }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ label: string; body: string } | null>(null);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const refundKey = useRef<string | null>(null);
  const recovery = view.recovery;

  const accept = async (choice: { optionId?: string; acceptTopUpMinor?: number } = {}) => {
    setBusy(true);
    setError(null);
    try {
      await api.acceptShopRecovery(order.id, recovery.id, choice);
    } catch (caught) {
      // A changed offer is not a failure: the server re-checked and drew a
      // fresh one, which the reload below puts in front of the client.
      const changed = caught instanceof api.ApiError && OFFER_CHANGED.includes(caught.message);
      setError({
        label: changed ? "Offer updated" : "Not done",
        body: userFacingError(caught, "Your choice did not go through. Check your connection and try again."),
      });
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const refund = async () => {
    setBusy(true);
    setError(null);
    try {
      refundKey.current ??= api.newIdempotencyKey();
      const updated = await api.refundShopRecovery(order.id, recovery.id, refundKey.current);
      refundKey.current = null;
      setConfirmRefund(false);
      if (updated?.refundRequestId) {
        router.push({
          pathname: "/order/refund",
          params: { orderId: order.id, refundId: updated.refundRequestId },
        });
      }
    } catch (caught) {
      setConfirmRefund(false);
      setError({
        label: "Not done",
        body: userFacingError(caught, "The refund was not requested. Check your connection and try again."),
      });
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const refundNote = shopRecoveryRefundNote(order);
  const checking = topUpChecking(view);
  const heading = view.kind === "top_up"
    ? checking
      ? "We are checking your payment for the new shop"
      : `Pay ${formatPhp(view.amountMinor)} to move to the new shop`
    : shopRecoveryHeadline(recovery);
  const body =
    view.kind === "offer"
      ? view.pricing
        ? "GRIDGO found another vetted shop that prints the same item, to the same specs. Check the date and price, then choose it or a full refund."
        : "GRIDGO found another vetted shop that prints the same item, to the same specs, at the same price. Choose it, or a full refund."
      : view.kind === "above_cap"
        ? "GRIDGO found another vetted shop for the same item, but it costs more than GRIDGO can cover. Pay the rest, pick another shop, or get a full refund."
        : view.kind === "top_up"
          ? checking
            ? "Operations is matching your transfer against GRIDGO's wallet. The new shop starts once they confirm it. Do not pay again."
            : "You chose to pay the rest. Work on this order is paused until Operations confirms this payment, then the new shop starts."
          : view.kind === "no_match"
            ? "No other shop can print it exactly as ordered right now, so GRIDGO offers you a full refund."
            : "Operations will contact you about what happens next. Work on this order is paused until then.";
  const change = view.kind === "top_up" ? view.change : null;

  return (
    <View className="gap-5">
      <View className="gap-2">
        {view.kind === "top_up" ? (
          <View className="flex-row">
            <StatusChip
              tone={checking ? "info" : "warning"}
              icon="clock"
              label={checking ? "Payment being checked" : "Not paid yet"}
            />
          </View>
        ) : null}
        <Text accessibilityRole="header" className="text-h2 text-text-primary">
          {heading}
        </Text>
        <Text className="text-body text-text-secondary">{body}</Text>
      </View>

      {view.kind === "offer" || view.kind === "above_cap" ? (
        <DateChange next={view.promiseBy} previous={order.promiseBy} />
      ) : null}
      {(view.kind === "offer" || view.kind === "above_cap") && view.pricing ? (
        <PriceComparisonPanel order={order} pricing={view.pricing} />
      ) : null}

      {error?.label === "Offer updated" ? (
        <View className="gg-panel gap-2">
          <View className="flex-row">
            <StatusChip tone="info" icon="clock" label={error.label} />
          </View>
          <Text className="text-body text-text-primary">{error.body}</Text>
        </View>
      ) : error ? (
        <ErrorState label={error.label} body={error.body} />
      ) : null}

      {view.kind === "top_up" && change?.status === "pending_payment" ? (
        <QrTopUpForm
          draftKey={`change:${order.id}:${change.id}`}
          draft={useChangePayment}
          amountMinor={change.totalMinor}
          rejectionReason={change.rejectionReason}
          paymentKind="change"
          afterConfirmed="The new shop starts once Operations verifies the transfer."
          primary
          send={async (input, key) => {
            await api.submitOrderChangePayment(order.id, change.id, { expectedVersion: change.version, ...input }, key);
            onChanged();
          }}
          onConflict={onChanged}
        />
      ) : view.kind === "top_up" && checking && change?.payment ? (
        <View className="gg-panel">
          <SpecRow label="Amount sent" value={formatPhp(change.totalMinor)} />
          <SpecRow label="Reference you sent" value={change.payment.reference} />
          <SpecRow label="Sent" value={formatTimelineStamp(change.payment.submittedAt)} />
        </View>
      ) : view.kind === "top_up" && !change ? (
        <ErrorState
          label="Payment step not loaded"
          body="The payment for the new shop did not load with your order. Try again in a moment."
          onRetry={onChanged}
        />
      ) : null}

      <View className="gap-4">
        {view.kind === "offer" ? (
          <DecisionChoice
            primary
            label="Accept the new shop"
            note={shopRecoveryAcceptNote(view.pricing)}
            disabled={busy}
            onPress={() => void accept()}
          />
        ) : null}
        {view.kind === "above_cap" && recovery.canPayDifference ? (
          <DecisionChoice
            label={`Pay ${formatPhp(view.pricing.clientPaysMinor)} more and accept`}
            note={payTheRestNote(view.pricing.clientPaysMinor)}
            disabled={busy}
            onPress={() => void accept(acceptChoice({ pricing: view.pricing }, false))}
          />
        ) : null}
        {view.kind === "above_cap" && view.alternatives.length ? (
          <View className="gap-4 border-t border-outline-subtle pt-4">
            <Text className="text-body font-medium text-text-primary">Or pick another shop</Text>
            {view.alternatives.map((option) => (
              <DecisionChoice
                key={option.optionId}
                label={alternativeLabel(option)}
                note={alternativeNote(option)}
                disabled={busy}
                onPress={() => void accept(acceptChoice(option, true))}
              />
            ))}
          </View>
        ) : null}
        {recovery.canRefund ? (
          <DecisionChoice
            primary={view.kind === "no_match"}
            label={view.kind === "no_match" || view.kind === "operations" ? "Get a full refund" : "Get a full refund instead"}
            note={view.kind === "operations" ? `Prefer not to wait? ${refundNote}` : refundNote}
            disabled={busy}
            onPress={() => setConfirmRefund(true)}
          />
        ) : null}
      </View>

      <ConfirmDialog
        visible={confirmRefund}
        question="Cancel this order for a full refund?"
        body={`${refundNote} This cannot be undone.`}
        confirmLabel="Get a full refund"
        cancelLabel="Go back"
        tone="destructive"
        busy={busy}
        onCancel={() => setConfirmRefund(false)}
        onConfirm={() => void refund()}
      />
    </View>
  );
}

/**
 * What the job costs the client before and after the move, and who pays the
 * difference. Drawn on their own fee-inclusive Printing, so every peso here is
 * one they pay, get back, or are spared — never a shop's own price.
 */
function PriceComparisonPanel({ order, pricing }: { order: Order; pricing: ShopMovePricing }) {
  const comparison = priceComparison(order, pricing);
  const changed = comparison.wasMinor != null && comparison.nowMinor != null && comparison.wasMinor !== comparison.nowMinor;
  return (
    <View className="gg-panel gap-2" testID="shop-move-price">
      {changed ? (
        <>
          <SpecRow label="Your printing now" value={formatPhp(comparison.wasMinor as number)} />
          <SpecRow label="With the new shop" value={formatPhp(comparison.nowMinor as number)} />
        </>
      ) : comparison.wasMinor != null ? (
        <SpecRow label="Your printing" value={formatPhp(comparison.wasMinor)} />
      ) : null}
      {comparison.rows.map((row) => (
        <SpecRow key={row.label} label={row.label} value={row.value} />
      ))}
      <Text className="text-caption text-text-muted">{comparison.note}</Text>
    </View>
  );
}
