import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { GroupPlate } from "@/components/ShopGroupSection";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import type { Basket, Order } from "@/lib/api";
import {
  basketGroupDeadlineOf,
  byDate,
  groupDateLine,
  groupLetter,
  groupStateMeta,
  groupStoppedNote,
  placedGroupsTitle,
} from "@/lib/basketGroups";

type Props = {
  order: Order;
  /** Null while the basket is read, or when that read failed. */
  basket: Basket | null;
  onSelect: (orderId: string) => void;
};

/**
 * The groups of one multi-group order, at the top of its order view
 * (gridgo-api#117). A group is one shop on one date (gridgo-client#189), so
 * each row says its date beside its state, soonest first.
 *
 * Behind one order and one payment, each shop is its own job: its own rider,
 * its own progress, its own refund. So the order view shows one group at a
 * time — everything under this card is the selected group's — and this card
 * is how a client moves between them. Every group carries its live state, so
 * one that was cancelled or refunded reads as such before it is opened, and
 * the selected one says what that means for the rest of the order.
 */
export function BasketGroupsCard({ order, basket, onSelect }: Props) {
  const colors = useThemeColors();
  const groups = byDate(basket?.groups ?? [], (group) => basketGroupDeadlineOf(group, basket));
  const dated = groups.map((group) => ({ label: group.label, deadline: basketGroupDeadlineOf(group, basket) }));
  const stopped = groupStoppedNote(order);

  return (
    <View className="gg-card-flush" testID="basket-groups">
      <View className="gap-1 px-4 pb-3 pt-4">
        <Text className="text-body-lg font-medium text-text-primary">{placedGroupsTitle(dated)}</Text>
        <Text className="text-caption text-text-muted">
          Each part prints and delivers on its own date, with its own rider. You paid once for all
          of them.
        </Text>
      </View>

      {groups.length === 0 ? (
        // The basket read is not back (or failed): this group alone, still honest.
        <View className="flex-row items-center gap-3 border-t border-outline-subtle px-4 py-3">
          <GroupPlate letter={groupLetter(order.groupLabel ?? "Shop")} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-body font-medium text-text-primary">
              {order.groupLabel ?? "This shop group"}
            </Text>
            <Text className="text-caption text-text-secondary">
              {groupDateLine(order.deadline ?? order.basketDeadline ?? null)}
            </Text>
          </View>
          <Text className="text-caption text-text-muted">Viewing</Text>
        </View>
      ) : (
        groups.map((group) => {
          const selected = group.orderId === order.id;
          const meta = groupStateMeta(group, basket?.fulfillmentMode ?? order.fulfillmentMode);
          const dateLine = groupDateLine(basketGroupDeadlineOf(group, basket));
          return (
            <Pressable
              key={group.orderId}
              onPress={() => {
                if (!selected) onSelect(group.orderId);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${group.label}. ${dateLine}. ${meta.label}.${selected ? " Showing now." : ""}`}
              testID={`basket-group-${groupLetter(group.label)}`}
              className={
                selected
                  ? "gg-touch flex-row items-center gap-3 border-t border-outline-subtle bg-surface-variant px-4 py-3"
                  : "gg-touch flex-row items-center gap-3 border-t border-outline-subtle px-4 py-3"
              }
              style={({ pressed }) => (pressed && !selected ? { opacity: 0.7 } : undefined)}
            >
              <GroupPlate letter={groupLetter(group.label)} />
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-body font-medium text-text-primary">{group.label}</Text>
                <Text className="text-caption text-text-secondary">{dateLine}</Text>
                <View className="flex-row">
                  <StatusChip tone={meta.tone} label={meta.label} icon={meta.icon} />
                </View>
              </View>
              {selected ? (
                <Text className="text-caption font-medium text-text-primary">Viewing</Text>
              ) : (
                <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
              )}
            </Pressable>
          );
        })
      )}

      {stopped ? (
        <View className="border-t border-outline-subtle px-4 py-3">
          <Text className="text-body text-text-secondary">{stopped}</Text>
        </View>
      ) : null}
    </View>
  );
}
