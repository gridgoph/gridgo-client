import { Image } from "expo-image";
import { Check, ChevronRight } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";

import { OrderReference } from "@/components/OrderReference";
import { OrderStageRail } from "@/components/OrderStageRail";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import { notificationImageUrl, type Notification } from "@/lib/api";
import { presentNotification } from "@/lib/notificationPresentation";
import { formatTimelineStamp } from "@/lib/relativeTime";

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
 * One update, as a counter docket or a door slip.
 *
 * Collect jobs stamp COLLECT and ride a Counter rail; door jobs stay on
 * Dispatch / Delivered. Unread is still ink, not gold. The full date and
 * time stay, because an update about a deadline is worth an exact stamp.
 *
 * Swiping the row left marks it read, which is the legacy gesture. A gesture
 * is never the only way to do a thing here: tapping opens the job, and the row
 * carries an accessibility action for anyone who cannot swipe.
 *
 * Built on `PanResponder` rather than react-native-gesture-handler, the same
 * choice `components/Sheet.tsx` makes. A gesture root is mounted now, for the
 * deadline calendar's month strip, so this could move — but a row that opens
 * on tap and carries its own accessibility action gains nothing from tracking
 * a finger off the JavaScript thread, and the change would be churn.
 */
export function NotificationCard({ notification, read, onOpen, onMarkRead }: Props) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  // State rather than a ref: the value object is read during render for the
  // transform, and a ref must not be.
  const [translateX] = useState(() => new Animated.Value(0));
  const presented = presentNotification(notification);
  const picture = notificationImageUrl(notification.imageUrl);
  const spine =
    presented.collectReady ? colors.brand : presented.collectHold ? colors.outline : null;

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
        {/*
          A row with no job behind it is not a disabled button — announcing it
          as one tells a screen-reader user something is broken. It keeps its
          mark-read action and drops the button role entirely.
        */}
        <Pressable
          onPress={onOpen ?? undefined}
          accessibilityRole={onOpen ? "button" : undefined}
          accessibilityLabel={`${read ? "" : "Unread. "}${presented.stamp ? `${presented.stamp}. ` : ""}${presented.title}. ${presented.body}${presented.paymentLine ? `. ${presented.paymentLine}` : ""}`}
          accessibilityHint={onOpen ? presented.hint ?? "Opens this job" : undefined}
          accessibilityActions={read ? undefined : [{ name: "markRead", label: "Mark read" }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "markRead") onMarkRead();
          }}
          className={
            read
              ? "gg-card-flush"
              : "overflow-hidden rounded-card border border-outline bg-surface-high"
          }
        >
          {({ pressed }) => (
            <>
              <View className="flex-row">
                {spine ? (
                  <View
                    style={{ width: 3, backgroundColor: spine }}
                    aria-hidden
                  />
                ) : null}
                <View className="min-w-0 flex-1 gap-4 p-4">
                  <View className="flex-row items-start gap-3">
                    <View className="flex-1 gap-1">
                      {presented.stamp ? (
                        <View className="flex-row items-center gap-2">
                          {!read ? (
                            <View
                              className="h-2 w-2 rounded-pill bg-accent"
                              aria-hidden
                            />
                          ) : null}
                          <Text className="flex-1 text-overline text-text-muted" numberOfLines={1}>
                            {presented.stamp}
                          </Text>
                        </View>
                      ) : null}
                      <View className="flex-row items-center gap-2">
                        {!read && !presented.stamp ? (
                          <View
                            className="h-2 w-2 rounded-pill bg-accent"
                            aria-hidden
                          />
                        ) : null}
                        <Text
                          className={
                            read
                              ? "flex-1 text-body-lg text-text-primary"
                              : "flex-1 text-body-lg font-medium text-text-primary"
                          }
                        >
                          {presented.title}
                        </Text>
                      </View>
                      <Text className="text-body text-text-secondary">{presented.body}</Text>
                      {presented.paymentLine ? <Text className="text-body font-medium text-text-primary">{presented.paymentLine}</Text> : null}
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

                  {presented.jobLine || presented.reference || presented.railKind ? (
                    <View className="gap-3 border-t border-outline-subtle pt-4">
                      {/*
                        Which job this is about: its reference as a tag, then
                        its name. The tag is what a client quotes back to
                        Operations, so it is the same shape as on the order.
                      */}
                      {presented.jobLine || presented.reference ? (
                        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
                          {presented.reference ? (
                            <OrderReference id={notification.orderId} />
                          ) : null}
                          {presented.jobLine ? (
                            <Text
                              className="shrink text-caption text-text-muted"
                              numberOfLines={1}
                            >
                              {presented.jobLine}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                      {presented.railKind ? (
                        <OrderStageRail
                          currentIndex={presented.stageIndex}
                          kind={presented.railKind}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>

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
