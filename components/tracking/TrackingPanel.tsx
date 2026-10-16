import { useEffect, useMemo, type ReactNode } from "react";
import { PanResponder, Pressable, View, type LayoutChangeEvent } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KEYBOARD_CARET_GAP } from "@/components/FormScreen";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import { SHEET_SPRING } from "@/lib/sheet";
import { dragPanel, settlePanel, type PanelGeometry } from "@/lib/trackingPanel";

type Props = {
  geometry: PanelGeometry;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Reports the resting content's height, so the stops can fit it. */
  onPeekLayout: (height: number) => void;
  /** Always on show: where the delivery stands. */
  peek: ReactNode;
  /** The rest of the order, reached by pulling the panel up. */
  children: ReactNode;
};

/**
 * The delivery screen's pull-up panel (gridgo-client#232).
 *
 * It rests low over the map showing `peek`, and pulls up — by dragging, a
 * flick, or a tap on the handle — to carry the whole order underneath. The
 * drag is a `PanResponder` so it behaves the same on a phone and on the web,
 * and it claims a vertical drag on the capture phase so one that starts on a
 * button in the peek still moves the panel. The handle is a real button with
 * an `expanded` state, because dragging is not an accessible gesture.
 *
 * Its body is the keyboard-aware scroll the rest of the app's forms use: the
 * order underneath can be asking for a payment reference.
 */
export function TrackingPanel({
  geometry,
  expanded,
  onExpandedChange,
  onPeekLayout,
  peek,
  children,
}: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const offset = useSharedValue(geometry.travel);
  const dragStart = useSharedValue(0);

  // Follow the stops when they move (a re-measured peek, a rotated phone) or
  // when something other than a drag opens the panel.
  useEffect(() => {
    const target = expanded ? 0 : geometry.travel;
    offset.set(reducedMotion ? target : withSpring(target, SHEET_SPRING));
  }, [expanded, geometry.travel, offset, reducedMotion]);

  const { travel } = geometry;
  const responder = useMemo(() => {
    const vertical = (dx: number, dy: number) =>
      Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.2;
    const settle = (target: number) =>
      offset.set(reducedMotion ? target : withSpring(target, SHEET_SPRING));
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) => vertical(gesture.dx, gesture.dy),
      onMoveShouldSetPanResponder: (_, gesture) => vertical(gesture.dx, gesture.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragStart.set(offset.get());
      },
      onPanResponderMove: (_, gesture) => {
        offset.set(dragPanel(dragStart.get(), gesture.dy, travel));
      },
      onPanResponderRelease: (_, gesture) => {
        const next = settlePanel(offset.get(), gesture.vy, travel) === "expanded";
        // Settle here as well: when the stop does not change, the effect
        // above has nothing to react to and the panel would stay mid-drag.
        settle(next ? 0 : travel);
        if (next !== expanded) onExpandedChange(next);
      },
      onPanResponderTerminate: () => settle(expanded ? 0 : travel),
    });
  }, [offset, dragStart, travel, expanded, onExpandedChange, reducedMotion]);

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: geometry.height,
          backgroundColor: colors.surface,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderTopWidth: 1,
          borderColor: colors.outline,
          // A border alone is lost against a busy map; a soft lift is not.
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
        },
        slide,
      ]}
    >
      <View
        {...responder.panHandlers}
        onLayout={(event: LayoutChangeEvent) => onPeekLayout(event.nativeEvent.layout.height)}
      >
        <Pressable
          onPress={() => onExpandedChange(!expanded)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Show the map" : "Show order details"}
          accessibilityState={{ expanded }}
          hitSlop={4}
          className="items-center justify-center"
          style={{ height: 28 }}
        >
          <View
            className="h-1 w-10 rounded-pill"
            style={{ backgroundColor: colors.textMuted, opacity: 0.5 }}
          />
        </Pressable>
        {peek}
      </View>
      <View className="flex-1" {...(expanded ? {} : responder.panHandlers)}>
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          scrollEnabled={expanded}
          bottomOffset={KEYBOARD_CARET_GAP}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          {children}
        </KeyboardAwareScrollView>
      </View>
    </Animated.View>
  );
}
