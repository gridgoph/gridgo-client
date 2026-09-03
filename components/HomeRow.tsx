import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { OrderStageRail } from "@/components/OrderStageRail";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { getOrderStateMeta, orderNextAction } from "@/lib/orderState";
import { fulfilmentRailKind, orderStageIndex } from "@/lib/orderStages";
import { formatRelativeTime } from "@/lib/relativeTime";

type RowProps = {
  headline: string;
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
};

/**
 * One dense job row on Home's needs-you docket.
 *
 * Shared chrome only: headline, a subline the caller owns, and a chevron.
 * Waiting jobs and jobs merely running are different questions, so they do not
 * share copy — or, since the rebuild, a shape.
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
 * A job that is not waiting on the client — where it has got to, at a glance.
 *
 * It answers the one question a person opens the app to ask about a job that
 * needs nothing from them: where is it. That takes three facts and no more.
 * What it is, so they recognise it. When it last moved, so a job that has sat
 * still for a week is visible as one. And how far along it is, on the four
 * coarse stages — the same rail the notifications draw, in its compact form,
 * because three full rails would push the start menu off the screen.
 *
 * The chip and the rail are not the same fact twice. The rail is deliberately
 * coarse; the chip is the precise state, and the difference between "Printing"
 * and "Checking your payment" is exactly what a client needs. When the state
 * is one this app does not know, `orderStageIndex` returns null and no rail is
 * drawn at all — an invented position is worse than none.
 *
 * Money, quantity and reorder stay off: Orders owns the full card, and this is
 * a summary. A tap opens the job.
 */
export function HomeJobRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const meta = getOrderStateMeta(order.state, order.fulfillmentMode);
  const kind = fulfilmentRailKind(order.fulfillmentMode);
  const stage = orderStageIndex(order.state, order.fulfillmentMode);
  const moved = order.updatedAt ? formatRelativeTime(order.updatedAt) : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${order.title}, ${meta.label}`}
      className="gg-card gg-touch"
    >
      {({ pressed }) => (
        <>
          <View className="flex-row items-baseline gap-3">
            <Text
              className="min-w-0 flex-1 text-body-lg font-medium text-text-primary"
              numberOfLines={2}
            >
              {order.title}
            </Text>
            {moved ? (
              <Text className="shrink-0 text-caption text-text-muted">{moved}</Text>
            ) : null}
          </View>

          <View className="mt-3 flex-row">
            <StatusChip tone={meta.tone} label={meta.label} icon={meta.icon} />
          </View>

          {stage != null ? (
            <View className="mt-4">
              <OrderStageRail currentIndex={stage} kind={kind} variant="compact" />
            </View>
          ) : null}

          {pressed ? (
            <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-card" />
          ) : null}
        </>
      )}
    </Pressable>
  );
}
