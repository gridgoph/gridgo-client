import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { getOrderStateMeta, orderNextAction } from "@/lib/orderState";

type RowProps = {
  headline: string;
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
};

/**
 * One dense job row on Home.
 *
 * Shared chrome only: headline, a subline the caller owns, and a chevron.
 * Waiting jobs and recent jobs are different questions, so they do not share
 * copy — only this box.
 */
function HomeRow({ headline, onPress, accessibilityLabel, children }: RowProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="gg-touch flex-row items-center gap-3 px-4 py-3"
    >
      {({ pressed }) => (
        <>
          <View className="min-w-0 flex-1">
            <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
              {headline}
            </Text>
            {children}
          </View>
          <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * A job that is waiting on the client.
 *
 * The next verb is the headline — pay, approve, replace, collect — because
 * Home's first question is "is anything waiting on me", not "what jobs exist".
 * The job's name sits under that. Money, spec and the status chip live on the
 * order screen and on Orders; repeating them here spent a card's height to
 * say the same thing twice.
 */
export function HomeActionRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const action = orderNextAction(order);
  const headline = action?.title ?? getOrderStateMeta(order.state, order.fulfillmentMode).label;

  return (
    <HomeRow headline={headline} onPress={onPress} accessibilityLabel={`${headline}, ${order.title}`}>
      <Text className="mt-1 text-caption text-text-muted" numberOfLines={1}>
        {order.title}
      </Text>
    </HomeRow>
  );
}

/**
 * A job that is not waiting on the client — a snapshot, not a second list.
 *
 * Title first so the client recognises the job, then the human status (icon,
 * label, colour) so the row still reads in greyscale. Orders owns search,
 * filters, reorder and the full card.
 */
export function HomeJobRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const meta = getOrderStateMeta(order.state, order.fulfillmentMode);

  return (
    <HomeRow
      headline={order.title}
      onPress={onPress}
      accessibilityLabel={`${order.title}, ${meta.label}`}
    >
      <View className="mt-2 flex-row">
        <StatusChip tone={meta.tone} label={meta.label} icon={meta.icon} />
      </View>
    </HomeRow>
  );
}
