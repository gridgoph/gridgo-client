import { Text, View } from "react-native";
import type { CashDetail, Order } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { CASH_BARRED_REASON, cashDebtOutstanding, cashOrderLine, repaymentState } from "@/lib/cash";
import { ErrorState } from "@/components/ErrorState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusChip } from "@/components/StatusChip";

/** Cash collection is a fact of its own, never an online installment. */
export function CashOrderCard({ order, detail, onRetry, onRepay }: {
  order: Order;
  detail: CashDetail | null | "error";
  onRetry?: () => void;
  onRepay?: () => void;
}) {
  const debt = cashDebtOutstanding(order);
  if (debt && detail === "error") {
    return <ErrorState label="Cash status did not load" body="Refresh before making a repayment. Your order is safe; do not pay twice." onRetry={onRetry} />;
  }
  const cash = detail && detail !== "error" ? detail : null;
  const status = repaymentState(cash);
  const pending = debt && status === "pending";
  const confirmed = order.cash?.status === "no_show_repaid" || status === "confirmed" || Boolean(cash?.repaymentConfirmedAt);
  const collected = order.cash?.status === "collected";
  const amount = debt ? cash?.amountDueMinor : order.totalMinor;
  return (
    <View className="gg-card gap-3">
      <StatusChip label={pending ? "Repayment with Operations" : confirmed ? "Online repayment confirmed" : cashOrderLine(order) ?? "Cash on delivery"}
        tone={collected || confirmed ? "success" : debt ? "warning" : "neutral"}
        icon={collected || confirmed ? "circle-check" : "clock"} />
      {debt && !confirmed ? (
        <>
          {amount != null ? <Text className="text-h3 text-text-primary">{formatPhp(amount)} owed online</Text> : null}
          <Text className="text-body text-text-secondary">{CASH_BARRED_REASON}</Text>
          {pending ? (
            <Text className="text-body text-text-secondary">Operations is checking your repayment receipt. Do not send another transfer. Cash stays unavailable until it is confirmed.</Text>
          ) : status === "rejected" ? (
            <><Text className="text-body font-medium text-error">Repayment proof needs correction</Text>
              {cash?.repayment?.rejectionReason ? <Text className="text-body text-text-secondary">{cash.repayment.rejectionReason}</Text> : null}
              <Text className="text-body text-text-secondary">Check the reference and replace the proof. If money already left your wallet, contact GRIDGO before paying again.</Text></>
          ) : null}
          <Text className="text-caption text-text-muted">Your order is held at GRIDGO Office. Redelivery is at your cost; message GRIDGO to arrange it.</Text>
          {!pending && cash && amount != null && amount > 0 && onRepay ? <PrimaryButton label="Repay online" onPress={onRepay} /> : null}
          {!cash ? <Text className="text-body text-text-muted">Loading the latest cash status…</Text> : null}
        </>
      ) : confirmed ? (
        <Text className="text-body text-text-secondary">Operations confirmed the online repayment for this cash order. Redelivery is at your cost; message GRIDGO to arrange it.</Text>
      ) : order.cash?.status === "due" ? (
        <><Text className="text-body text-text-secondary">Have {amount != null ? formatPhp(amount) : "the exact total"} ready for the rider. Pay at delivery, then sign the acknowledgement receipt.</Text>
          <Text className="text-caption text-text-muted">Your digital invoice is available under Receipt.</Text></>
      ) : null}
    </View>
  );
}
