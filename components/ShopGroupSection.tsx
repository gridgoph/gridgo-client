import { CalendarDays, Plus } from "lucide-react-native";
import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { VOUCHER_SHARE_LABEL, voucherAmount } from "@/lib/vouchers";
import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp } from "@/lib/api";
import { addMoreFromLabel, groupDateLine, type ShopGroupView } from "@/lib/basketGroups";
import { listingZoneLine } from "@/lib/distanceZone";
import { discountAmount, ORGANIZATION_DISCOUNT_LABEL } from "@/lib/organization";

/**
 * The letter a shop group goes by, set as a plate.
 *
 * GRIDGO names groups "Shop A", "Shop B" and never by who the shop is, so the
 * letter is the group's whole identity on every screen — checkout, the order
 * and the receipt draw the same plate, and a client learns "B" once. Ink on a
 * quiet panel, never yellow: a group is a thing to tell apart, not to press.
 */
export function GroupPlate({ letter, size = "md" }: { letter: string; size?: "sm" | "md" }) {
  return (
    <View
      aria-hidden
      className={
        size === "sm"
          ? "h-7 w-7 items-center justify-center rounded-field border border-outline bg-surface-variant"
          : "h-10 w-10 items-center justify-center rounded-field border border-outline bg-surface-variant"
      }
    >
      <Text
        className={
          size === "sm"
            ? "text-caption font-bold text-text-primary"
            : "text-h3 font-bold text-text-primary"
        }
      >
        {letter}
      </Text>
    </View>
  );
}

type Props = {
  group: ShopGroupView;
  /** Collected at GRIDGO Office rather than delivered. */
  pickup: boolean;
  /**
   * A hub pick-up fee is charged once for the whole order. Each group's share
   * is not a charge of its own, so the group says so instead of a figure.
   */
  sharedPickupFee?: boolean;
  busy: boolean;
  /** A hairline above the group, to part it from the one before. */
  divided?: boolean;
  /** The group's basket lines, drawn by checkout. */
  children: ReactNode;
  onAddMore: () => void;
  /** Move this group's products to another date. */
  onChangeDate?: () => void;
  /** The client tried to place the order and this group still has no date. */
  dateError?: boolean;
};

/**
 * One group of a multi-group basket on checkout: one shop on one date
 * (gridgo-api#117, gridgo-client#189).
 *
 * Plate and label, the date it is needed by, what the group's items come to,
 * its lines, then its own delivery fee — each shop delivers each date on its
 * own, so each has one — and the way to add more from the same shop for the
 * same date, which rides with it at no extra delivery fee.
 */
export function ShopGroupSection({
  group,
  pickup,
  sharedPickupFee = false,
  busy,
  divided = false,
  children,
  onAddMore,
  onChangeDate,
  dateError = false,
}: Props) {
  const colors = useThemeColors();
  const count = group.lines.length;
  const zone = listingZoneLine({
    distanceZone: group.zone,
    distanceKm: group.distanceKm ?? undefined,
  });

  return (
    <View
      className={divided ? "gap-3 border-t border-outline pt-6" : "gap-3"}
      testID={`shop-group-${group.letter}`}
    >
      <View
        className="flex-row items-center gap-3"
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${group.label}. ${groupDateLine(group.deadline)}. ${count === 1 ? "1 item" : `${count} items`}. ${
          group.itemsMinor == null ? "Price not yet known" : formatPhp(group.itemsMinor)
        }`}
      >
        <GroupPlate letter={group.letter} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body-lg font-medium text-text-primary">{group.label}</Text>
          <Text className="text-caption text-text-muted">
            {count === 1 ? "1 item" : `${count} items`}
          </Text>
        </View>
        <Text className="text-body text-text-secondary">
          {group.itemsMinor == null ? "Not yet" : formatPhp(group.itemsMinor)}
        </Text>
      </View>

      {/*
        The date is the group's other half: same shop, two dates, two groups.
        It sits on its own row, with the way to move it, because "which of
        these arrives when" is the question a client brings to this screen.
      */}
      <Pressable
        onPress={onChangeDate}
        disabled={!onChangeDate || busy}
        accessibilityRole="button"
        accessibilityLabel={`${group.label}: ${groupDateLine(group.deadline)}. ${group.deadline ? "Change the date" : "Choose a date"}.`}
        accessibilityState={{ disabled: !onChangeDate || busy }}
        testID={`shop-group-date-${group.letter}`}
        className={
          dateError
            ? "gg-touch flex-row items-center gap-2 rounded-field border border-error px-3 py-2"
            : "gg-touch flex-row items-center gap-2 rounded-field border border-outline px-3 py-2"
        }
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <CalendarDays size={16} color={dateError ? colors.error : colors.textPrimary} strokeWidth={2} aria-hidden />
        <Text
          className={
            dateError
              ? "min-w-0 flex-1 text-body font-medium text-error"
              : "min-w-0 flex-1 text-body font-medium text-text-primary"
          }
        >
          {groupDateLine(group.deadline)}
        </Text>
        {onChangeDate ? (
          <Text className="text-button text-text-primary">{group.deadline ? "Change" : "Choose"}</Text>
        ) : null}
      </Pressable>

      {children}

      <View className="gg-panel flex-row items-baseline justify-between gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body text-text-secondary">
            {pickup ? "Brought to GRIDGO Office" : `Delivery from ${group.label}`}
          </Text>
          {!pickup && zone ? <Text className="text-caption text-text-muted">{zone}</Text> : null}
        </View>
        <Text className="text-body font-medium text-text-primary">
          {pickup && sharedPickupFee
            ? "In the one pick-up fee"
            : group.deliveryFeeMinor == null
              ? "Set with your address"
              : group.deliveryFeeMinor === 0
                ? pickup
                  ? "No charge"
                  : formatPhp(0)
                : formatPhp(group.deliveryFeeMinor)}
        </Text>
      </View>

      {group.organizationDiscountMinor > 0 ? (
        <View
          className="flex-row items-baseline justify-between gap-3 px-4"
          accessible
          accessibilityLabel={`${ORGANIZATION_DISCOUNT_LABEL} on ${group.label}, minus ${formatPhp(group.organizationDiscountMinor)}`}
        >
          <Text className="text-body text-text-secondary">{ORGANIZATION_DISCOUNT_LABEL}</Text>
          <Text className="text-body font-medium text-success">{discountAmount(group.organizationDiscountMinor)}</Text>
        </View>
      ) : null}

      {group.voucherDiscountMinor ? (
        <View
          className="flex-row items-baseline justify-between gap-3 px-4"
          accessible
          accessibilityLabel={`${VOUCHER_SHARE_LABEL} on ${group.label}, minus ${formatPhp(group.voucherDiscountMinor)}`}
        >
          <Text className="text-body text-text-secondary">{VOUCHER_SHARE_LABEL}</Text>
          <Text className="text-body font-medium text-success">{voucherAmount(group.voucherDiscountMinor)}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={onAddMore}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`${addMoreFromLabel(group.label, group.deadline)}. No extra delivery fee.`}
        accessibilityState={{ disabled: busy }}
        className={busy ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
        style={({ pressed }) => (pressed && !busy ? { opacity: 0.85 } : undefined)}
      >
        <Plus size={16} color={colors.textPrimary} strokeWidth={2.5} aria-hidden />
        <Text className="min-w-0 shrink text-center text-button text-text-primary">
          {addMoreFromLabel(group.label, group.deadline)}
        </Text>
      </Pressable>
    </View>
  );
}
