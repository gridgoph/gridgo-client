import { Image } from "expo-image";
import { Check, ChevronRight } from "lucide-react-native";
import { useMemo, useRef } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";

import { OrderStageRail } from "@/components/OrderStageRail";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import { notificationImageUrl, type Notification } from "@/lib/api";
import { formatTimelineStamp } from "@/lib/relativeTime";
import { orderStageIndex } from "@/lib/orderStages";
import { getOrderStateMeta } from "@/lib/orderState";

/** Past this much of a drag, letting go marks the row read. */
const DISMISS_DISTANCE = 96;
/** Below this the gesture is a scroll, not a swipe. */
const HORIZONTAL_INTENT = 12;

type Props = {
  notification: Notification;
  read: boolean;
  onOpen: (() => void) | null;
  onMarkRead: () => void;
};

/**
 * One update, in the shape the legacy GRIDGO app used.
 *
 * What that shape gets right, and what this keeps: an unread row that is
 * obviously unread, the full date and time rather than "3h ago" alone, and —
 * the part worth carrying over — the job's own stage drawn inline, so the
 * notification says where the work actually is and not merely that something
 * happened.
 *
 * Swiping the row left marks it read, which is the legacy gesture. A gesture
 * is never the only way to do a thing here: tapping opens the job, and the row
 * carries an accessibility action for anyone who cannot swipe.
 *
 * Built on `PanResponder` rather than react-native-gesture-handler, which is
 * the same choice `components/Sheet.tsx` makes and keeps one drag idiom in the
 * app — and avoids mounting a gesture root the rest of the app does not need.
 */
export function NotificationCard({ notification, read, onOpen, onMarkRead }: Props) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const translateX = useRef(new Animated.Value(0)).current;
  const stageIndex = orderStageIndex(notification.orderState);
  const picture = notificationImageUrl(notification.imageUrl);

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

  const meta = notification.orderState ? getOrderStateMeta(notification.orderState) : null;

  return (
    <View className="relative">
      {/*
        What the swipe reveals, drawn behind the row so it is already there as
        the card moves rather than appearing after it.
      */}
      {!read ? (
        <View
          className="absolute inset-0 flex-row items-center justify-end rounded-card bg-surface-variant pr-5"
          // Three spellings for three runtimes: iOS, Android, and the web
          // renderer, which honours neither of the native two.
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Check size={18} color={colors.textMuted} strokeWidth={2} />
          <Text className="ml-2 text-caption text-text-muted">Mark read</Text>
        </View>
      ) : null}

      <Animated.View
        style={reducedMotion ? undefined : { transform: [{ translateX }] }}
        {...(read ? {} : responder.panHandlers)}
      >
        {/*
          A row with no job behind it is not a disabled button — announcing it
          as one tells a screen-reader user something is broken. It keeps its
          mark-read action and drops the button role entirely.
        */}
        <Pressable
          onPress={onOpen ?? undefined}
          accessibilityRole={onOpen ? "button" : undefined}
          accessibilityLabel={`${read ? "" : "Unread. "}${notification.title}. ${notification.body}`}
          accessibilityHint={onOpen ? "Opens this job" : undefined}
          accessibilityActions={read ? undefined : [{ name: "markRead", label: "Mark read" }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "markRead") onMarkRead();
          }}
          className={
            read
              ? "gg-card-flush gap-4 p-4"
              : "gap-4 rounded-card border border-outline bg-surface-high p-4"
          }
        >
          {({ pressed }) => (
            <>
              <View className="flex-row items-start gap-3">
                <View className="flex-1 gap-1">
                  <View className="flex-row items-center gap-2">
                    {/* Ink, not gold. A list can hold ten unread rows, and ten
                        gold dots would outspend the one yellow this screen is
                        allowed — which the tab bar's "+" already is. The dot
                        joins a raised surface and a heavier title, so unread
                        survives greyscale three times over. */}
                    {!read ? (
                      <View
                        className="h-2 w-2 rounded-pill bg-accent"
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                    ) : null}
                    <Text
                      className={
                        read
                          ? "flex-1 text-body-lg text-text-primary"
                          : "flex-1 text-body-lg font-medium text-text-primary"
                      }
                    >
                      {notification.title}
                    </Text>
                  </View>
                  <Text className="text-body text-text-secondary">{notification.body}</Text>
                  {/* Date and time, as the legacy card showed it — an update
                      about a deadline is worth an exact stamp. */}
                  <Text className="text-caption text-text-muted">
                    {formatTimelineStamp(notification.at)}
                  </Text>
                </View>
                {onOpen ? (
                  <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
                ) : null}
              </View>

              {picture ? (
                <Image
                  testID="notification-picture"
                  source={{ uri: picture }}
                  style={{ width: "100%", height: 144, borderRadius: 12 }}
                  contentFit="cover"
                />
              ) : null}

              {notification.orderState ? (
                <View className="gap-3 border-t border-outline-subtle pt-4">
                  <Text className="text-caption text-text-muted" numberOfLines={1}>
                    {notification.orderTitle
                      ? `${notification.orderTitle} · ${meta?.label}`
                      : meta?.label}
                  </Text>
                  <OrderStageRail currentIndex={stageIndex} />
                </View>
              ) : null}

              {pressed ? (
                <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-card" />
              ) : null}
            </>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}
