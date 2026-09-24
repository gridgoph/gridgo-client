import { Image } from "expo-image";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  PackageCheck,
  SquarePen,
  Star,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";

import { OrderReference } from "@/components/OrderReference";
import { OrderStageRail } from "@/components/OrderStageRail";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import { notificationImageUrl, type Notification } from "@/lib/api";
import {
  presentNotification,
  timelineRows,
  type NotificationCallout,
  type NotificationCalloutIcon,
  type NotificationGroup,
} from "@/lib/notificationPresentation";
import type { OrderStatusTone } from "@/lib/orderState";
import { formatRelativeTime, formatTimelineStamp } from "@/lib/relativeTime";

/** Timeline point: its size, and its drop to sit on the title's first line. */
const DOT_SIZE = 8;
const DOT_TOP = 6;

/** Past this much of a drag, letting go marks the row read. */
const DISMISS_DISTANCE = 96;
/** Below this the gesture is a scroll, not a swipe. */
const HORIZONTAL_INTENT = 12;

const CALLOUT_ICONS = {
  wallet: Wallet,
  clock: Clock,
  upload: Upload,
  "square-pen": SquarePen,
  "package-check": PackageCheck,
  star: Star,
} satisfies Record<NotificationCalloutIcon, LucideIcon>;

/** Semantic tone → the theme colour it is drawn in. `neutral` carries no signal. */
const TONE_TOKEN = {
  success: "success",
  warning: "warning",
  error: "error",
  info: "info",
  neutral: "textSecondary",
} as const satisfies Record<OrderStatusTone, string>;

type Props = {
  /** One job's rows (or one lone row); the newest speaks for the card. */
  group: NotificationGroup;
  /** The group's read state — its newest row's. */
  read: boolean;
  onOpen: (() => void) | null;
  onMarkRead: () => void;
};

/**
 * One job's updates, read top to bottom in the order a client asks about them.
 *
 * 1. Where it is: a four-segment meter and the stage in words, with how long
 *    ago it moved. The meter used to be a full rail at the foot of the card,
 *    below everything a client had to read past to reach it.
 * 2. What happened: the newest update's title, and at most two lines of it.
 *    The whole text is in the accessibility label, and the order holds the rest.
 * 3. What to do or know, when there is one thing: a toned callout, not bold
 *    body text, because it is the reason to open the card and it read as more
 *    paragraph. Its copy and tone are `presentNotification`'s.
 * 4. Which job: the reference and the job's name, quietly, at the foot.
 *
 * Earlier updates about the same job sit behind "Show N earlier updates", as
 * a connected timeline grouped by day (`timelineRows`).
 *
 * Unread is an ink spine down the card's leading edge and a heavier title, not
 * gold: the screen's yellow is the "+". In Light the unread surface is the
 * same white as a read one, so the spine is what carries it there.
 *
 * Swiping the row left marks it read — every update in it — which is the
 * legacy gesture. A gesture is never the only way to do a thing here: tapping
 * opens the job, and the row carries an accessibility action for anyone who
 * cannot swipe.
 *
 * Built on `PanResponder` rather than react-native-gesture-handler, the same
 * choice `components/Sheet.tsx` makes. A gesture root is mounted now, for the
 * deadline calendar's month strip, so this could move — but a row that opens
 * on tap and carries its own accessibility action gains nothing from tracking
 * a finger off the JavaScript thread, and the change would be churn.
 */
export function NotificationCard({ group, read, onOpen, onMarkRead }: Props) {
  const notification = group.latest;
  const earlier = group.items.slice(1);
  const [expanded, setExpanded] = useState(false);
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  // State rather than a ref: the value object is read during render for the
  // transform, and a ref must not be.
  const [translateX] = useState(() => new Animated.Value(0));
  const presented = presentNotification(notification);
  const picture = notificationImageUrl(notification.imageUrl);
  // A row with no job is GRIDGO speaking, and says so rather than leaving the
  // strip empty beside its time.
  const where =
    presented.stamp ??
    presented.stageLabel?.toUpperCase() ??
    (notification.orderId ? null : "FROM GRIDGO");
  const exact = formatTimelineStamp(notification.at);

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Claim the gesture only once it is clearly sideways, so the list still
        // scrolls normally through the row.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !read &&
          Math.abs(gesture.dx) > HORIZONTAL_INTENT &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderMove: (_event, gesture) => {
          // Left only. Dragging right does nothing, so the row cannot be left
          // hanging in a state that means nothing.
          translateX.setValue(Math.min(0, gesture.dx));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx <= -DISMISS_DISTANCE) {
            onMarkRead();
          }
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            speed: 20,
            bounciness: 0,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            speed: 20,
            bounciness: 0,
          }).start();
        },
      }),
    [read, onMarkRead, translateX],
  );

  const spoken = [
    read ? null : "Unread",
    where,
    presented.title,
    presented.body,
    presented.callout
      ? [presented.callout.title, presented.callout.detail].filter(Boolean).join(". ")
      : null,
    presented.jobLine,
    exact,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <View className="relative">
      {/*
        What the swipe reveals, drawn behind the row so it is already there as
        the card moves rather than appearing after it.
      */}
      {!read ? (
        <View
          className="absolute inset-0 flex-row items-center justify-end rounded-card bg-surface-variant pr-5"
          // aria-hidden hides it from assistive tech on iOS, Android, and web.
          aria-hidden
        >
          <Check size={18} color={colors.textMuted} strokeWidth={2} />
          <Text className="ml-2 text-caption text-text-muted">Mark read</Text>
        </View>
      ) : null}

      <Animated.View
        style={reducedMotion ? undefined : { transform: [{ translateX }] }}
        {...(read ? {} : responder.panHandlers)}
      >
        <View
          testID={read ? "notification-card-read" : "notification-card-unread"}
          className={
            read
              ? "gg-card-flush"
              : "overflow-hidden rounded-card border border-outline bg-surface-high"
          }
        >
          <View className="flex-row">
            {!read ? (
              <View
                testID="notification-unread-spine"
                style={{ width: 3, backgroundColor: colors.accent }}
                aria-hidden
              />
            ) : null}
            <View className="min-w-0 flex-1">
              {/*
                A row with no job behind it is not a disabled button — announcing it
                as one tells a screen-reader user something is broken. It keeps its
                mark-read action and drops the button role entirely.
              */}
              <Pressable
                onPress={onOpen ?? undefined}
                accessibilityRole={onOpen ? "button" : undefined}
                accessibilityLabel={spoken}
                accessibilityHint={onOpen ? presented.hint ?? "Opens this job" : undefined}
                accessibilityActions={read ? undefined : [{ name: "markRead", label: "Mark read" }]}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === "markRead") onMarkRead();
                }}
              >
                {({ pressed }) => (
                  <>
                    <View className="gap-3 p-4">
                      {/* Where the job is, and when it last moved. */}
                      <View className="min-h-4 flex-row items-center gap-2">
                        {presented.railKind && presented.stageIndex != null ? (
                          <OrderStageRail
                            currentIndex={presented.stageIndex}
                            kind={presented.railKind}
                            variant="meter"
                          />
                        ) : null}
                        <Text
                          className="min-w-0 flex-1 text-overline text-text-muted"
                          numberOfLines={1}
                        >
                          {where ?? ""}
                        </Text>
                        <Text className="shrink-0 text-caption text-text-muted">
                          {formatRelativeTime(notification.at)}
                        </Text>
                      </View>

                      <View className="gap-1">
                        <Text
                          className={
                            read
                              ? "text-body-lg text-text-primary"
                              : "text-body-lg font-bold text-text-primary"
                          }
                          numberOfLines={2}
                        >
                          {presented.title}
                        </Text>
                        <Text className="text-body text-text-secondary" numberOfLines={2}>
                          {presented.body}
                        </Text>
                      </View>

                      {picture ? (
                        <Image
                          testID="notification-picture"
                          source={{ uri: picture }}
                          style={{ width: "100%", height: 144, borderRadius: 12 }}
                          contentFit="cover"
                        />
                      ) : null}

                      {presented.callout ? <Callout callout={presented.callout} /> : null}

                      {/*
                        Which job this is about: its reference as a tag, then its
                        name. The tag is what a client quotes back to Operations,
                        so it is the same shape as on the order.
                      */}
                      {presented.reference || presented.jobLine || onOpen ? (
                        <View className="flex-row items-center gap-2">
                          {presented.reference ? (
                            <OrderReference id={notification.orderId} />
                          ) : null}
                          <Text
                            className="min-w-0 flex-1 text-caption text-text-secondary"
                            numberOfLines={1}
                          >
                            {presented.jobLine ?? ""}
                          </Text>
                          {onOpen ? (
                            <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                    {pressed ? (
                      <View pointerEvents="none" className="gg-pressed absolute inset-0" />
                    ) : null}
                  </>
                )}
              </Pressable>

              {earlier.length ? (
                <EarlierUpdates
                  items={earlier}
                  expanded={expanded}
                  onToggle={() => setExpanded((open) => !open)}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * The one thing to do or know, as a toned panel: an icon and a short line on
 * a soft wash of the tone's own colour, the same construction as the Home
 * docket's mark. Colour never carries it alone — the words say it, and the
 * icon repeats it in shape.
 */
function Callout({ callout }: { callout: NotificationCallout }) {
  const colors = useThemeColors();
  const color = colors[TONE_TOKEN[callout.tone]];
  const Icon = CALLOUT_ICONS[callout.icon];

  return (
    <View testID="notification-callout" className="flex-row gap-3 overflow-hidden rounded-field p-3">
      <View
        pointerEvents="none"
        className="absolute inset-0"
        style={{ backgroundColor: color, opacity: 0.12 }}
        aria-hidden
      />
      <View className="pt-0.5" aria-hidden>
        <Icon size={18} color={color} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{callout.title}</Text>
        {callout.detail ? (
          <Text className="text-caption text-text-secondary">{callout.detail}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The rest of the job's story, folded under the newest update.
 *
 * A real sequence, so it is drawn as one: a hairline spine through a hollow
 * point per update, newest first. The day is said once as a heading and a
 * time only where it changes, because the API writes several rows in one
 * minute and a stamp on each repeated itself down the list. Titles only — the
 * bodies repeat what the head of the card already says, and the order screen
 * holds the full record. Opening the list is a routine control, so it stays
 * in ink rather than spending the screen's yellow.
 */
function EarlierUpdates({
  items,
  expanded,
  onToggle,
}: {
  items: Notification[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const colors = useThemeColors();
  const label = expanded
    ? "Hide earlier updates"
    : `Show ${items.length} earlier ${items.length === 1 ? "update" : "updates"}`;
  const Chevron = expanded ? ChevronUp : ChevronDown;
  const rows = expanded ? timelineRows(items) : [];
  // The connector is muted ink, not `outline`: in Dark that is within a shade
  // of the unread card's surface and the line disappeared between the points.
  // It is pinned to each row's edges rather than grown with `flex-1`, which
  // collapses to nothing in a row sized by its text.
  const connector = {
    position: "absolute" as const,
    left: DOT_SIZE / 2 - 0.5,
    width: 1,
    backgroundColor: colors.textMuted,
    opacity: 0.4,
  };
  const firstEntry = rows.findIndex((row) => row.kind === "entry");
  const lastEntry = rows.length - 1 - [...rows].reverse().findIndex((row) => row.kind === "entry");

  return (
    <View className="border-t border-outline-subtle">
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded }}
        className="min-h-11 flex-row items-center justify-between gap-3 px-4 py-3"
      >
        {({ pressed }) => (
          <>
            <Text className="flex-1 text-body text-text-secondary">{label}</Text>
            <Chevron size={18} color={colors.textMuted} strokeWidth={2} />
            {pressed ? (
              <View pointerEvents="none" className="gg-pressed absolute inset-0" />
            ) : null}
          </>
        )}
      </Pressable>

      {expanded ? (
        <View className="px-4 pb-4" testID="notification-timeline">
          {rows.map((row, index) => {
            const lineAbove = index > firstEntry;
            const lineBelow = index < lastEntry;

            if (row.kind === "day") {
              return (
                <View key={row.key} className="flex-row gap-3">
                  <View className="w-2" aria-hidden>
                    {lineAbove && lineBelow ? (
                      <View style={[connector, { top: 0, bottom: 0 }]} />
                    ) : null}
                  </View>
                  <Text
                    className={
                      index === 0
                        ? "flex-1 pb-2 text-caption font-medium text-text-muted"
                        : "flex-1 pb-2 pt-1 text-caption font-medium text-text-muted"
                    }
                  >
                    {row.label}
                  </Text>
                </View>
              );
            }

            return (
              <View
                key={row.key}
                className="flex-row gap-3"
                accessible
                accessibilityLabel={`${row.title}, ${row.exact}`}
              >
                <View className="w-2" aria-hidden>
                  {lineAbove ? <View style={[connector, { top: 0, height: DOT_TOP }]} /> : null}
                  <View
                    className="h-2 w-2 rounded-pill border border-text-muted"
                    style={{ marginTop: DOT_TOP }}
                  />
                  {lineBelow ? (
                    <View style={[connector, { top: DOT_TOP + DOT_SIZE, bottom: 0 }]} />
                  ) : null}
                </View>
                <View
                  className={
                    index === lastEntry
                      ? "min-w-0 flex-1 flex-row items-baseline gap-3"
                      : "min-w-0 flex-1 flex-row items-baseline gap-3 pb-3"
                  }
                >
                  <Text className="min-w-0 flex-1 text-body text-text-primary">{row.title}</Text>
                  <Text className="shrink-0 text-caption text-text-muted">{row.time ?? ""}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
