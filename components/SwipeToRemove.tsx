import { Trash2 } from "lucide-react-native";
import { useCallback, useMemo, type ReactNode } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
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
  isHorizontalSwipe,
  restingOffset,
  REVEAL_WIDTH,
  ROW_SPRING,
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
 * `PanResponder` rather than gesture-handler, matching `components/Sheet.tsx`:
 * core React Native, no provider to mount, no root-view resolution to get
 * wrong, and the thresholds it reads are pure functions in `lib/swipeRow.ts`
 * that can actually be tested. `onMoveShouldSetPanResponder` only claims a
 * mostly-sideways drag, so the list underneath keeps its scroll.
 *
 * Swiping is not an accessible gesture, so the row also carries a real
 * "Remove" accessibility action and the sheet keeps a visible control of its
 * own. This is the fast path, never the only one.
 */
export function SwipeToRemove({ label, onRemove, disabled, children }: Props) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  // A shared value rather than a ref: the responder is built during render,
  // and only the value read and written inside its handlers may live here.
  const dragStart = useSharedValue(0);

  const settle = useCallback(
    (to: number) => {
      translateX.set(
        reducedMotion ? withTiming(to, { duration: 160 }) : withSpring(to, ROW_SPRING),
      );
    },
    [reducedMotion, translateX],
  );

  /** Close the row, then ask. The question belongs to the dialog, not the row. */
  const ask = useCallback(() => {
    settle(0);
    onRemove();
  }, [settle, onRemove]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        /*
          Capture as well as bubble. The whole row is a Pressable that opens
          the listing, so on a swipe the child has already claimed the touch;
          the capture phase is what lets this take it back mid-gesture. The
          guard is what keeps that safe — only a mostly-sideways drag is
          claimed, so a tap still opens the listing and a vertical drag still
          scrolls the sheet.
        */
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          !disabled && isHorizontalSwipe(gesture.dx, gesture.dy),
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !disabled && isHorizontalSwipe(gesture.dx, gesture.dy),
        onPanResponderGrant: () => {
          dragStart.set(translateX.get());
        },
        onPanResponderMove: (_event, gesture) => {
          translateX.set(swipeOffset(dragStart.get(), gesture.dx));
        },
        onPanResponderRelease: (_event, gesture) => {
          const release = swipeRelease(translateX.get(), gesture.vx);
          if (release === "commit") {
            translateX.set(
              withTiming(0, { duration: 160 }, (done) => {
                if (done) runOnJS(onRemove)();
              }),
            );
            return;
          }
          settle(restingOffset(release));
        },
        onPanResponderTerminate: () => {
          settle(0);
        },
      }),
    [disabled, translateX, dragStart, settle, onRemove],
  );

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
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
          className="flex-1 items-center justify-center gap-1 rounded-card border border-error bg-surface"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <Trash2
            size={18}
            color={colors.error}
            strokeWidth={2}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text className="text-button text-error">Remove</Text>
        </Pressable>
      </View>

      <Animated.View
        {...pan.panHandlers}
        style={rowStyle}
        accessibilityActions={ACCESSIBILITY_ACTIONS}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "remove") ask();
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

/** Swiping is not reachable with a screen reader; this is the same door. */
const ACCESSIBILITY_ACTIONS = [{ name: "remove", label: "Remove" }] as const;
