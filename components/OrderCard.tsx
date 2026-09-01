import { RotateCcw } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp, type Order } from "@/lib/api";
import { paymentStatusLabel } from "@/lib/copy";
import {
  formatPriceRange,
  getOrderStateMeta,
  orderTotalMinor,
  orderWaitingOn,
} from "@/lib/orderState";

type Props = {
  order: Order;
  onPress: () => void;
  /** Offered where reordering makes sense. Omitted, no reorder row renders. */
  onReorder?: () => void;
};

/**
 * One job in a list.
 *
 * Three levels, so the eye lands in the right place: what state the job is in
 * and whether it needs the client, then what the job is, then the money. The
 * chip carries icon, label and colour, so the row still reads in greyscale.
 *
 * Reorder is a separate control beside the card rather than inside it — a
 * nested button inside a tappable row is ambiguous to touch and to a screen
 * reader.
 */
export function OrderCard({ order, onPress, onReorder }: Props) {
  const colors = useThemeColors();
  const meta = getOrderStateMeta(order.state, order.fulfillmentMode);
  // Before a supplier accepts there is no exact price, so the card carries the
  // platform's range and marks it as one. It must never round an estimate into
  // a figure the client could hold GRIDGO to.
  const exactTotal = orderTotalMinor(order);
  const range = order.priceRange;
  const money =
    exactTotal != null
      ? formatPhp(exactTotal)
      : range
        ? formatPriceRange(range.subtotalMinMinor, range.subtotalMaxMinor)
        : "Not priced yet";
  const moneyNote = exactTotal != null ? paymentStatusLabel(order.paymentStatus) : "Estimate";
  const spec = [
    `Qty ${order.quantity}`,
    order.size || null,
    order.material || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View className="gg-card-flush">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${order.title}, ${meta.label}, ${money}`}
        accessibilityHint={orderWaitingOn(order) ?? undefined}
        className="p-4"
      >
        {({ pressed }) => (
          <>
            <StatusChipRow label={meta.label} tone={meta.tone} icon={meta.icon} />
            <Text
              className="mt-3 text-body-lg font-medium text-text-primary"
              numberOfLines={2}
            >
              {order.title}
            </Text>
            <Text className="mt-1 text-caption text-text-muted" numberOfLines={1}>
              {spec}
            </Text>
            <View className="mt-3 flex-row items-baseline justify-between gap-3">
              <Text className="shrink text-body-lg font-medium text-text-primary">{money}</Text>
              <Text className="text-caption text-text-muted">{moneyNote}</Text>
            </View>
            {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
          </>
        )}
      </Pressable>

      {onReorder ? (
        <Pressable
          onPress={onReorder}
          accessibilityRole="button"
          accessibilityLabel={`Reorder ${order.title}`}
          className="gg-touch flex-row items-center gap-2 border-t border-outline-subtle px-4 py-3"
        >
          {({ pressed }) => (
            <>
              <RotateCcw size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text className="text-button text-text-secondary">Order this again</Text>
              {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

/** The chip on its own line, so a long state label never squeezes the title. */
function StatusChipRow({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: React.ComponentProps<typeof StatusChip>["tone"];
  icon: React.ComponentProps<typeof StatusChip>["icon"];
}) {
  return (
    <View className="flex-row">
      <StatusChip tone={tone} label={label} icon={icon} />
    </View>
  );
}
