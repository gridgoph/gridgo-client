import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DateChange } from "@/components/DateChange";
import { DecisionChoice } from "@/components/DecisionChoice";
import { ErrorState } from "@/components/ErrorState";
import { StatusChip } from "@/components/StatusChip";
import type { Order } from "@/lib/api";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  SHOP_RECOVERY_ACCEPT_NOTE,
  SHOP_RECOVERY_HEADLINE,
  shopRecoveryRefundNote,
  type ShopRecoveryView,
} from "@/lib/shopRecovery";

type Props = {
  order: Order;
  view: ShopRecoveryView;
  /** Re-read the order after a choice; the response is not the whole order. */
  onChanged: () => void;
};

/**
 * The shop on this order could not take it (gridgo-supplier#102). One
 * decision, both answers on screen with what each one does next: the shop
 * GRIDGO found, at the same price with its own ready date, or a full refund.
 *
 * Accepting is one tap: the date and terms are already in front of them, and
 * the server re-checks the offer and shows a changed one again rather than
 * taking it. The refund asks first, because it ends the order.
 */
export function ShopRecoveryCard({ order, view, onChanged }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ label: string; body: string } | null>(null);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const refundKey = useRef<string | null>(null);
  const recovery = view.recovery;

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.acceptShopRecovery(order.id, recovery.id);
    } catch (caught) {
      // A changed offer is not a failure: the server re-checked and drew a
      // fresh one, which the reload below puts in front of the client.
      const changed = caught instanceof api.ApiError && caught.message === "shop_recovery_offer_changed";
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
  const body =
    view.kind === "offer"
      ? "GRIDGO found another vetted shop that prints the same item, to the same specs, at the same price. Choose it, or a full refund."
      : view.kind === "no_match"
        ? "No other shop can print it exactly as ordered right now, so GRIDGO offers you a full refund."
        : "Operations will contact you about what happens next. Work on this order is paused until then.";

  return (
    <View className="gap-5">
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-h2 text-text-primary">
          {SHOP_RECOVERY_HEADLINE}
        </Text>
        <Text className="text-body text-text-secondary">{body}</Text>
      </View>

      {view.kind === "offer" ? <DateChange next={view.promiseBy} previous={order.promiseBy} /> : null}

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

      <View className="gap-4">
        {view.kind === "offer" ? (
          <DecisionChoice
            primary
            label="Accept the new shop"
            note={SHOP_RECOVERY_ACCEPT_NOTE}
            disabled={busy}
            onPress={() => void accept()}
          />
        ) : null}
        {recovery.canRefund ? (
          <DecisionChoice
            primary={view.kind === "no_match"}
            label={view.kind === "offer" ? "Get a full refund instead" : "Get a full refund"}
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
