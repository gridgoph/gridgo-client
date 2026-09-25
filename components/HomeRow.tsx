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
import { ReadyTime } from "@/components/ReadyTime";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import {
  orderStateMeta,
  orderNextAction,
  orderWaitingOn,
  type OrderActionIcon,
  type OrderStatusIcon,
  type OrderStatusTone,
} from "@/lib/orderState";
import { fulfilmentRailKind, orderStageIndex } from "@/lib/orderStages";
import { formatRelativeTime } from "@/lib/relativeTime";
import { readyByDate } from "@/lib/readyTime";

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
  const meta = orderStateMeta(order);
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
 * A job in progress — where it has got to, at a glance.
 *
 * Led by the state in words ("Out for delivery", "Checking your payment"),
 * the same grammar as the docket above it, which leads with the verb: the
 * question for a live job is where it is, and the job's name is the subline
 * that says which. The tone icon beside the state is the colour signal and
 * never the only one.
 *
 * Under that, the four coarse stages on the compact rail, then what happens
 * next in a sentence — who has the job and what they are doing with it — and
 * the client's ready-by promise when there is one. The rail is deliberately
 * coarse and the headline is the precise state; the difference between
 * "Printing" and "Checking your payment" is exactly what a client needs. An
 * unknown state draws no rail at all — an invented position is worse than
 * none. GRIDGO publishes no ETA, so nothing here estimates one.
 *
 * Money, quantity and reorder stay off: Orders owns the full card. A tap
 * opens the job.
 */
export function HomeJobRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const colors = useThemeColors();
  const meta = orderStateMeta(order);
  const kind = fulfilmentRailKind(order.fulfillmentMode);
  const stage = orderStageIndex(order.state, order.fulfillmentMode);
  const moved = order.updatedAt ? formatRelativeTime(order.updatedAt) : null;
  const next = orderWaitingOn(order);
  const promised = readyByDate(order.promiseBy);
  const StateIcon = ICONS[meta.icon];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label}, ${order.title}`}
      className="gg-card-flush gg-touch"
    >
      {({ pressed }) => (
        <>
          <View className="px-4 pt-4">
            <View className="flex-row items-center gap-2">
              <StateIcon size={16} color={colors[TONE_TOKEN[meta.tone]]} strokeWidth={2.25} />
              <Text
                className="min-w-0 flex-1 text-body-lg font-bold text-text-primary"
                numberOfLines={1}
              >
                {meta.label}
              </Text>
              {moved ? (
                <Text className="shrink-0 text-caption text-text-muted">{moved}</Text>
              ) : null}
            </View>
            <Text className="mt-0.5 text-body text-text-secondary" numberOfLines={1}>
              {order.title}
            </Text>

            {stage != null ? (
              <View className="mt-4">
                <OrderStageRail currentIndex={stage} kind={kind} variant="compact" />
              </View>
            ) : null}
          </View>

          {next || promised ? (
            <>
              <View className="mt-4 gg-divider" />
              <View className="flex-row items-center gap-3 px-4 py-3">
                <View className="min-w-0 flex-1">
                  {next ? (
                    <Text className="text-body text-text-secondary" numberOfLines={2}>
                      {next}
                    </Text>
                  ) : null}
                  {promised ? (
                    <View className={next ? "mt-1" : undefined}>
                      <ReadyTime promiseBy={order.promiseBy} />
                    </View>
                  ) : null}
                </View>
                <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
              </View>
            </>
          ) : (
            <View className="h-4" />
          )}

          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * A finished job, as one quiet line.
 *
 * Nothing more will happen to it, so it does not get a card, a rail or a
 * colour-filled chip to compete with live work — three finished cards used to
 * push "Start a print" off the first screen. The check mark, the word
 * ("Completed", "Delivered", "Collected") and the success colour still say the
 * same thing three ways, so the row reads in grayscale. A tap reopens the job,
 * which is where the receipt and a reorder live.
 */
export function HomeFinishedRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const colors = useThemeColors();
  const meta = orderStateMeta(order);
  const when = order.updatedAt ? formatRelativeTime(order.updatedAt) : null;
  const status = when && when !== "—" ? `${meta.label} ${lowerFirst(when)}` : meta.label;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${order.title}, ${status}`}
      className="gg-touch flex-row items-center gap-3 px-4 py-3"
    >
      {({ pressed }) => (
        <>
          <View aria-hidden>
            <CircleCheck size={18} color={colors[TONE_TOKEN[meta.tone]]} strokeWidth={2} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-body text-text-primary" numberOfLines={1}>
              {order.title}
            </Text>
            <Text className="text-caption text-text-muted" numberOfLines={1}>
              {status}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
        </>
      )}
    </Pressable>
  );
}

/** "Yesterday" → "yesterday", so it reads inside "Completed yesterday". A date keeps its month's capital. */
function lowerFirst(value: string): string {
  return value === "Yesterday" || value === "Just now" ? value.toLowerCase() : value;
}
