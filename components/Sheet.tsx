import { X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Dimensions, Modal, PanResponder, Pressable, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
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

  // Kept mounted through the closing animation so the sheet is seen leaving:
  // `closing` is raised in the render `open` turns false and cleared once the
  // slide-out has finished.
  const [closing, setClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setClosing(true);
  }
  const mounted = open || closing;
  const screenHeight = Dimensions.get("window").height;
  const translateY = useSharedValue(screenHeight);

  const finishClose = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const close = useCallback(() => {
    // Reduced motion still goes through the animation callback, at zero
    // duration, so unmounting is always a reaction to the slide finishing
    // rather than a state write made straight from the effect.
    translateY.set(
      withTiming(screenHeight, { duration: reducedMotion ? 0 : 200 }, (done) => {
        if (done) runOnJS(finishClose)();
      }),
    );
  }, [reducedMotion, translateY, screenHeight, finishClose]);

  useEffect(() => {
    if (open) {
      translateY.set(reducedMotion ? 0 : withSpring(0, SHEET_SPRING));
      return;
    }
    if (closing) close();
  }, [open, closing, reducedMotion, translateY, close]);

  // The drag lives on the header, so the list inside keeps its own scrolling.
  //
  // `PanResponder` rather than react-native-gesture-handler: RNGH resolves its
  // root through the view tree, and a React Native `Modal` renders its children
  // outside that tree, so a `GestureDetector` in here silently never fires —
  // the sheet would simply not answer the finger. PanResponder is core React
  // Native, needs no provider, and behaves the same on both platforms.
  // A shared value rather than a ref: the responder is built during render,
  // and only the value read and written inside its handlers may live here.
  const dragStart = useSharedValue(0);
  const pan = useMemo(
    () =>
      PanResponder.create({
        // Both are needed: React Native Web only evaluates the move-claim
        // once something has claimed the start, so a move-only responder
        // never fires there and the sheet would ignore the finger on web.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => {
          dragStart.set(translateY.get());
        },
        onPanResponderMove: (_event, gesture) => {
          translateY.set(dragOffset(dragStart.get(), gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (shouldDismissOnRelease(translateY.get(), gesture.vy)) {
            translateY.set(
              withTiming(screenHeight, { duration: 180 }, (done) => {
                if (done) runOnJS(finishClose)();
              }),
            );
            return;
          }
          translateY.set(withSpring(0, SHEET_SPRING));
        },
        onPanResponderTerminate: () => {
          translateY.set(withSpring(0, SHEET_SPRING));
        },
      }),
    [translateY, dragStart, screenHeight, finishClose],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.get(),
      [0, DISMISS_DISTANCE * 2],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      {/*
        The sheet is anchored to the bottom of the screen, so an input inside it
        — the custom size entry on `OptionPicker` is the one that exists — is
        exactly where the keyboard lands. `padding` grows the space beneath the
        panel by the keyboard's height, which lifts a bottom-anchored sheet by
        the same amount.

        This is `react-native-keyboard-controller`'s `KeyboardAvoidingView`, not
        React Native's, and the difference is Android: React Native's takes no
        usable `behavior` there, and under Expo's mandatory edge-to-edge the
        window is no longer resized for the IME either, so the sheet did not
        move at all and the field was simply covered. The library reads the
        keyboard frame directly and has worked inside a React Native `Modal`
        since 1.13 — which matters here, because a `Modal` renders outside the
        app's view tree and that is already why this sheet drags with
        `PanResponder` rather than gesture-handler.
      */}
      <KeyboardAvoidingView
        behavior="padding"
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
