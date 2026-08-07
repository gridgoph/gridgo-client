import { Pressable, Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { formatPhp, type Order } from "@/lib/api";
import { getOrderStateMeta, orderGrandTotalMinor } from "@/lib/orderState";

type Props = {
  order: Order;
  onPress: () => void;
};

/**
 * Orders list row: title, status chip (icon+label), money.
 */
export function OrderCard({ order, onPress }: Props) {
  const meta = getOrderStateMeta(order.state);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${order.title}, ${meta.label}, ${formatPhp(orderGrandTotalMinor(order))}`}
      className="gg-card"
    >
      {({ pressed }) => (
        <>
          <View className="flex-row items-start justify-between gap-3">
            <Text className="flex-1 text-body-lg font-medium text-text-primary" numberOfLines={2}>
              {order.title}
            </Text>
            <StatusChip tone={meta.tone} label={meta.label} icon={meta.icon} />
          </View>
          <Text className="mt-2 text-body text-text-secondary">
            {formatPhp(orderGrandTotalMinor(order))}
            {order.paymentMethod ? ` · ${paymentLabel(order.paymentMethod)}` : ""}
          </Text>
          <Text className="mt-1 text-caption text-text-muted">
            Qty {order.quantity} · {order.size || "Size TBD"}
          </Text>
          {pressed ? <View className="gg-pressed absolute inset-0 rounded-card" /> : null}
        </>
      )}
    </Pressable>
  );
}

function paymentLabel(method: string): string {
  if (method === "pilot_credit") return "Pilot Credits";
  if (method === "cod") return "COD";
  return method;
}
