import {
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  PackageCheck,
  SquarePen,
  TriangleAlert,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { OrderStageRail } from "@/components/OrderStageRail";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import {
  getOrderStateMeta,
  orderNextAction,
  type OrderActionIcon,
  type OrderStatusIcon,
  type OrderStatusTone,
} from "@/lib/orderState";
import { fulfilmentRailKind, orderStageIndex } from "@/lib/orderStages";
import { formatRelativeTime } from "@/lib/relativeTime";

/**
 * The icons a docket row draws an action with, keyed by their name.
 *
 * A registry rather than Lucide's whole surface — the same shape `StatusChip`
 * and `HomeCategoryRow` keep. It covers the action vocabulary and the status
 * one, so a row with no action of its own can still fall back to the state's
 * icon rather than to nothing.
 */
const ICONS = {
  wallet: Wallet,
  upload: Upload,
  "package-check": PackageCheck,
  "square-pen": SquarePen,
  "triangle-alert": TriangleAlert,
  "circle-check": CircleCheck,
  "circle-x": CircleX,
  clock: Clock,
} satisfies Record<OrderActionIcon | OrderStatusIcon, LucideIcon>;

/** Semantic tone → the theme colour it is drawn in. `neutral` carries no signal. */
const TONE_TOKEN = {
  success: "success",
  warning: "warning",
  error: "error",
  info: "info",
  neutral: "textSecondary",
} as const satisfies Record<OrderStatusTone, string>;

/**
 * The tone mark on a docket row: one icon on a soft disc of its own colour.
 *
 * It exists because three rows of grey type read as one grey slab, and the
 * docket is the most important thing on Home. A client scanning it should be
 * able to tell "the artwork came back" from "your job is on the counter"
 * without reading a word — amber attention, informational decision, finished
 * green — and then read the verb that says exactly which.
 *
 * Deliberately a disc, and deliberately not `CropMarkFrame`. Those crop marks
 * are what tell the start board's five families apart from this docket, and a
 * sheet-shaped well here would blur the one distinction the two lists have.
 *
 * The tint is a colour layer at low opacity under the icon rather than an
 * opacity on the whole mark, or the icon would fade with its own background.
 * The mark is never the only signal: the verb beside it says the same thing in
 * words, so the row survives grayscale and a screen reader.
 */
function ToneMark({ icon, tone }: { icon: OrderActionIcon | OrderStatusIcon; tone: OrderStatusTone }) {
  const colors = useThemeColors();
  const color = colors[TONE_TOKEN[tone]];
  const Icon = ICONS[icon];

  return (
    <View
      testID="home-action-mark"
      aria-hidden
      className="h-10 w-10 shrink-0 items-center justify-center rounded-pill"
    >
      <View
        pointerEvents="none"
        className="absolute inset-0 rounded-pill"
        style={{ backgroundColor: color, opacity: 0.14 }}
      />
      <Icon size={19} color={color} strokeWidth={2} />
    </View>
  );
}

type RowProps = {
  headline: string;
  onPress: () => void;
  accessibilityLabel: string;
  leading?: ReactNode;
  children: ReactNode;
};

/**
 * One dense job row on Home's needs-you docket.
 *
 * Shared chrome only: an optional leading mark, the headline, a subline the
 * caller owns, and a chevron. Waiting jobs and jobs merely running are
 * different questions, so they do not share copy — or, since the rebuild, a
 * shape.
 */
function HomeRow({ headline, onPress, accessibilityLabel, leading, children }: RowProps) {
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
          {leading}
          <View className="min-w-0 flex-1">
            <Text className="text-body-lg font-medium text-text-primary" numberOfLines={2}>
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
 * The job's name sits under that, and it is set in body rather than in muted
 * caption: two jobs can be waiting on the very same verb ("Collect at GRIDGO
 * Office", twice), and then the name is the only thing telling them apart.
 * Money, spec and the status chip live on the order screen and on Orders;
 * repeating them here spent a card's height to say the same thing twice.
 *
 * The mark's tone comes from the action, not from the state — see the comment
 * on `OrderNextAction` for why those are not the same fact.
 */
export function HomeActionRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const action = orderNextAction(order);
  const meta = getOrderStateMeta(order.state, order.fulfillmentMode);
  const headline = action?.title ?? meta.label;

  return (
    <HomeRow
      headline={headline}
      onPress={onPress}
      accessibilityLabel={`${headline}, ${order.title}`}
      leading={<ToneMark icon={action?.icon ?? meta.icon} tone={action?.tone ?? meta.tone} />}
    >
      <Text className="mt-0.5 text-body text-text-secondary" numberOfLines={1}>
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
