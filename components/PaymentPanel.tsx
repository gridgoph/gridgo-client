import { useState } from "react";
import { Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { ApiError, formatPhp, type Order } from "@/lib/api";
import * as api from "@/lib/api";
import {
  COD_LIMIT_NOTICE,
  COD_ONE_ACTIVE_NOTICE,
  CREDITS_NON_CASH_NOTICE,
  evaluateCodEligibility,
  formatCreditsShortfallMessage,
} from "@/lib/payment";
import { orderGrandTotalMinor } from "@/lib/orderState";

type Props = {
  order: Order;
  balanceMinor: number;
  /** Other client orders for one-active COD check. */
  otherOrders: Order[];
  onPaid: (order: Order) => void;
};

/**
 * Pilot payment: Pilot Credits or eligible COD only.
 * Rules are explained before submit; no top-up controls.
 */
export function PaymentPanel({ order, balanceMinor, otherOrders, onPaid }: Props) {
  const [busy, setBusy] = useState<"credits" | "cod" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = orderGrandTotalMinor(order);
  const cod = evaluateCodEligibility(total, otherOrders, order.id);
  const enoughCredits = balanceMinor >= total;

  const payWithCredits = async () => {
    setBusy("credits");
    setError(null);
    try {
      const result = await api.authorizeCredits(order.id);
      onPaid(result.order);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        const body = e.body as { needMinor?: number; balanceMinor?: number };
        const need = body.needMinor ?? total;
        const bal = body.balanceMinor ?? balanceMinor;
        setError(formatCreditsShortfallMessage(need, bal));
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Could not authorize credits.");
      }
    } finally {
      setBusy(null);
    }
  };

  const payWithCod = async () => {
    if (!cod.eligible) {
      setError(cod.reason ?? "COD is not available for this order.");
      return;
    }
    setBusy("cod");
    setError(null);
    try {
      const next = await api.transitionOrder(order.id, "payment_authorized", {
        paymentMethod: "cod",
        note: "Cash on Delivery selected",
      });
      onPaid(next);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.message === "cod_limit" || e.message === "cod_not_eligible") {
          setError(COD_LIMIT_NOTICE);
        } else if (e.message === "cod_one_active") {
          setError(COD_ONE_ACTIVE_NOTICE);
        } else {
          setError(e.message);
        }
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Could not authorize COD.");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gg-card gap-4">
      <Text className="text-h3 text-text-primary">Payment</Text>
      <Text className="text-body text-text-secondary">
        Total due {formatPhp(total)} (print {formatPhp(order.totalMinor)} + delivery{" "}
        {formatPhp(order.deliveryFeeMinor)}).
      </Text>

      <View className="gg-panel gap-2">
        <Text className="text-caption text-text-muted">Pilot Credits available</Text>
        <Text className="text-h3 text-text-primary">{formatPhp(balanceMinor)}</Text>
        <Text className="text-caption text-text-muted">{CREDITS_NON_CASH_NOTICE}</Text>
        {!enoughCredits ? (
          <StatusChip
            tone="warning"
            label="Balance below this order total"
            icon="triangle-alert"
          />
        ) : null}
      </View>

      <View className="gap-2">
        <PrimaryButton
          label={busy === "credits" ? "Authorizing…" : "Pay with Pilot Credits"}
          disabled={busy !== null}
          onPress={() => void payWithCredits()}
        />
        {!enoughCredits ? (
          <Text className="text-caption text-warning">
            You can still try — the server will return the exact shortfall if needed.
          </Text>
        ) : null}
      </View>

      <View className="gg-divider" />

      <View className="gap-2">
        <Text className="text-body-lg font-medium text-text-primary">Cash on Delivery</Text>
        <Text className="text-caption text-text-muted">{COD_LIMIT_NOTICE}</Text>
        <Text className="text-caption text-text-muted">{COD_ONE_ACTIVE_NOTICE}</Text>
        {cod.eligible ? (
          <StatusChip tone="success" label="COD available for this order" icon="circle-check" />
        ) : (
          <StatusChip
            tone="error"
            label={cod.reason ?? "COD not available"}
            icon="circle-x"
          />
        )}
        <SecondaryButton
          label={busy === "cod" ? "Authorizing…" : "Pay with Cash on Delivery"}
          disabled={busy !== null || !cod.eligible}
          onPress={() => void payWithCod()}
        />
        {!cod.eligible && cod.reason ? (
          <Text className="text-caption text-error">{cod.reason}</Text>
        ) : null}
      </View>

      {error ? <Text className="text-body text-error">{error}</Text> : null}
    </View>
  );
}
