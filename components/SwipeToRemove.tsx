import { Trash2 } from "lucide-react-native";
import { useCallback, useMemo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import {
  restingOffset,
  REVEAL_WIDTH,
  ROW_SETTLE_MS,
  ROW_SPRING,
  SWIPE_ACTIVE_OFFSET_X,
  SWIPE_FAIL_OFFSET_Y,
  swipeOffset,
  swipeRelease,
} from "@/lib/swipeRow";

type Props = {
  /** What is being removed, for the action's label and a screen reader. */
  label: string;
  /** Ask to remove it. Never removes on its own — the caller confirms. */
  onRemove: () => void;
  disabled?: boolean;
  children: ReactNode;
};

/**
 * Swipe a basket row left to get at Remove.
 *
 * The gesture never deletes anything by itself. A long drag past the commit
 * distance, or a tap on the revealed control, asks the question; the caller
 * puts a confirmation in front of it. A basket item carries an upload and a
 * quantity somebody typed, and losing it to a stray thumb on a scrolling list
 * is not a trade worth making for one fewer tap.
 *
 * The drag runs in react-native-gesture-handler, on the UI thread. It used to
 * be a `PanResponder`, and on iPhone that lost the touch: JavaScript claimed
 * the swipe a beat after the finger moved, and by then the list's native
 * scroll recognizer had started and cancelled every JavaScript touch, so the
 * row snapped shut mid-drag and the question was never asked. A native pan
 * takes part in iOS's own gesture arbitration instead of arriving after it.
 * `activeOffsetX` / `failOffsetY` (`lib/swipeRow.ts`) keep the list scrolling.
 *
 * Swiping is not an accessible gesture, so the row also carries a real
 * "Remove" accessibility action and the screen keeps a visible control of its
 * own. This is the fast path, never the only one.
 */
export function SwipeToRemove({ label, onRemove, disabled, children }: Props) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  const dragStart = useSharedValue(0);

  const settle = useCallback(
    (to: number) => {
      translateX.set(
        reducedMotion ? withTiming(to, { duration: ROW_SETTLE_MS }) : withSpring(to, ROW_SPRING),
      );
    },
    [reducedMotion, translateX],
  );

  /*
    Close the row, then ask — on the next tick, never inside the gesture's or
    the press's own frame. The question is a modal, and presenting one while
    the touch that asked for it is still being delivered risks it arriving
    half drawn. It no longer waits on the close animation either: a close that
    was interrupted used to swallow the question entirely.
  */
  const ask = useCallback(() => {
    settle(0);
    setTimeout(onRemove, 0);
  }, [settle, onRemove]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId("swipe-to-remove")
        .enabled(!disabled)
        .activeOffsetX([-SWIPE_ACTIVE_OFFSET_X, SWIPE_ACTIVE_OFFSET_X])
        .failOffsetY([-SWIPE_FAIL_OFFSET_Y, SWIPE_FAIL_OFFSET_Y])
        .onStart(() => {
          "worklet";
          dragStart.set(translateX.get());
        })
        .onUpdate((event) => {
          "worklet";
          translateX.set(swipeOffset(dragStart.get(), event.translationX));
        })
        .onEnd((event) => {
          "worklet";
          const release = swipeRelease(translateX.get(), event.velocityX);
          if (release === "commit") {
            runOnJS(ask)();
            return;
          }
          const to = restingOffset(release);
          translateX.set(
            reducedMotion
              ? withTiming(to, { duration: ROW_SETTLE_MS })
              : withSpring(to, { ...ROW_SPRING, velocity: event.velocityX }),
          );
        }),
    [disabled, reducedMotion, translateX, dragStart, ask],
  );

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  /*
    The action is drawn only while the row is off its resting place. It is the
    card's own size and radius, so at rest its red border sat under the card's
    anti-aliased rounded corners and tinted them (#325). Hiding it closed
    changes nothing about the swipe: the first point of travel uncovers it.

    Only the drawing fades. The button and everything above it stay at full
    opacity, because Android hides a view under an alpha-0 ancestor from
    TalkBack, and the closed Remove button must stay reachable.
  */
  const actionStyle = useAnimatedStyle(() => ({
    opacity: translateX.get() !== 0 ? 1 : 0,
  }));

  return (
    <View className="relative">
      {/*
        The action sits under the row and is uncovered by it, rather than
        sliding in from the side — so what the client drags is the thing they
        are acting on, and the control is already fully drawn when it appears.
      */}
      <View
        className="absolute bottom-0 right-0 top-0 flex-row items-stretch"
        style={{ width: REVEAL_WIDTH }}
      >
        <Pressable
          onPress={ask}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          accessibilityState={{ disabled: Boolean(disabled) }}
          className="flex-1"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <Animated.View testID="swipe-to-remove-action" style={[{ flex: 1 }, actionStyle]}>
            <View className="flex-1 items-center justify-center gap-1 rounded-card border border-error bg-surface">
              <Trash2
                size={18}
                color={colors.error}
                strokeWidth={2}
                aria-hidden
              />
              <Text className="text-button text-error">Remove</Text>
            </View>
          </Animated.View>
        </Pressable>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View
          testID="swipe-to-remove-row"
          style={rowStyle}
          accessibilityActions={ACCESSIBILITY_ACTIONS}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "remove") ask();
          }}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** Swiping is not reachable with a screen reader; this is the same door. */
const ACCESSIBILITY_ACTIONS = [{ name: "remove", label: "Remove" }] as const;
