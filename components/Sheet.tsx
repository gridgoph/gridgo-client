import { X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Extrapolation,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  dragOffset,
  DISMISS_DISTANCE,
  SHEET_SPRING,
  shouldDismissOnRelease,
} from "@/lib/sheet";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  open: boolean;
  onClose: () => void;
  /** What this sheet is for. Announced when the sheet takes focus. */
  title: string;
  /** One line under the title, where the choice needs framing. */
  subtitle?: string;
  children: ReactNode;
  /** Share of the screen the sheet may grow to. It is content-sized below this. */
  maxHeightRatio?: number;
};

/**
 * A bottom sheet that behaves like one.
 *
 * The sheets this replaced used `Modal animationType="slide"` — a fixed 300ms
 * ramp that ignores the finger completely, which is what "the modal slide is
 * not optimized" describes. This one is spring-driven and interruptible, tracks
 * the drag one-to-one, and decides dismissal from throw velocity as well as
 * distance, so a quick flick closes it and a slow half-drag springs back.
 *
 * Where a *route* suits the content better, use the platform's own form sheet
 * instead — see `app/order/request-changes.tsx` and the root layout. This
 * component exists for the case a route cannot serve: a reusable form control
 * whose options are computed by whoever renders it, which would otherwise have
 * to push option lists through URL params.
 *
 * Height comes from the content, capped at `maxHeightRatio` of the screen. A
 * three-row picker does not open full-height.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxHeightRatio = 0.75,
}: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  // Kept mounted through the closing animation so the sheet is seen leaving.
  const [mounted, setMounted] = useState(open);
  const screenHeight = Dimensions.get("window").height;
  const translateY = useSharedValue(screenHeight);

  const finishClose = useCallback(() => {
    setMounted(false);
    onClose();
  }, [onClose]);

  const close = useCallback(() => {
    if (reducedMotion) {
      finishClose();
      return;
    }
    translateY.value = withTiming(screenHeight, { duration: 200 }, (done) => {
      if (done) runOnJS(finishClose)();
    });
  }, [reducedMotion, translateY, screenHeight, finishClose]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      translateY.value = reducedMotion ? 0 : withSpring(0, SHEET_SPRING);
      return;
    }
    if (mounted) close();
  }, [open, reducedMotion, translateY, close, mounted]);

  // The drag lives on the header, so the list inside keeps its own scrolling.
  //
  // `PanResponder` rather than react-native-gesture-handler: RNGH resolves its
  // root through the view tree, and a React Native `Modal` renders its children
  // outside that tree, so a `GestureDetector` in here silently never fires —
  // the sheet would simply not answer the finger. PanResponder is core React
  // Native, needs no provider, and behaves the same on both platforms.
  const dragStart = useRef(0);
  const pan = useMemo(
    () =>
      PanResponder.create({
        // Both are needed: React Native Web only evaluates the move-claim
        // once something has claimed the start, so a move-only responder
        // never fires there and the sheet would ignore the finger on web.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => {
          dragStart.current = translateY.value;
        },
        onPanResponderMove: (_event, gesture) => {
          translateY.value = dragOffset(dragStart.current, gesture.dy);
        },
        onPanResponderRelease: (_event, gesture) => {
          if (shouldDismissOnRelease(translateY.value, gesture.vy)) {
            translateY.value = withTiming(screenHeight, { duration: 180 }, (done) => {
              if (done) runOnJS(finishClose)();
            });
            return;
          }
          translateY.value = withSpring(0, SHEET_SPRING);
        },
        onPanResponderTerminate: () => {
          translateY.value = withSpring(0, SHEET_SPRING);
        },
      }),
    [translateY, screenHeight, finishClose],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, DISMISS_DISTANCE * 2],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        {/* The scrim dims what is behind and dismisses on tap. Safe here: a
            picker holds no work, so nothing is lost by closing it. */}
        <Animated.View
          style={[{ ...ABSOLUTE_FILL, backgroundColor: colors.scrim }, scrimStyle]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${title}`}
            onPress={close}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={title}
          className="overflow-hidden rounded-t-card border-t border-outline bg-surface"
          style={[
            sheetStyle,
            {
              maxHeight: screenHeight * maxHeightRatio,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View {...pan.panHandlers}>
            {/* Grabber: the affordance that says this can be dragged. */}
            <View className="items-center pb-1 pt-2">
              <View className="h-1 w-9 rounded-pill bg-outline" />
            </View>
            <View className="flex-row items-start justify-between gap-4 border-b border-outline-subtle px-4 pb-3">
              <View className="flex-1">
                <Text className="text-h3 text-text-primary">{title}</Text>
                {subtitle ? (
                  <Text className="mt-1 text-caption text-text-muted">{subtitle}</Text>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={close}
                className="gg-touch items-center justify-center"
              >
                <X size={20} color={colors.textSecondary} strokeWidth={2} />
              </Pressable>
            </View>
          </View>

          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ABSOLUTE_FILL = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;
