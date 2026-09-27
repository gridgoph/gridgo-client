import { useEffect, useRef, type ReactNode } from "react";
import { ScrollView, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { ReceiptSlip } from "@/components/ReceiptSlip";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import type { ReceiptView } from "@/lib/receipt";
import {
  PRINT_END_FRAME,
  PRINT_FEED_MS,
  PRINT_OVERSHOOT_PX,
  PRINT_SETTLE_MS,
  printStartFrame,
  slipFeedFrom,
  THANKS_DELAY_MS,
  THANKS_FADE_MS,
  THANKS_RISE_PX,
} from "@/lib/receiptPrint";

type Props = {
  /** The summary to print; null while it is still being read. */
  view: ReceiptView | null;
  showServiceFee: boolean;
  /** The thank-you, which fades in as the slip comes to rest. */
  thanks: ReactNode;
  /** The screen's actions. On screen from the first frame and never animated. */
  actions: ReactNode;
};

/** A paper feed: quick out of the slot, slowing as the slip comes free. */
const FEED_EASING = Easing.bezier(0.22, 0.61, 0.36, 1);

/**
 * The order-placed moment: the order summary printing out of a slot.
 *
 * A slot sits at the top of the screen and the slip feeds down out of it,
 * torn edge first, so the total and the payment line arrive before the
 * header — the way a hanging till slip reads. It overshoots its rest by a few
 * pixels and settles: the tear. The thank-you fades in underneath as it stops.
 * One orchestrated moment, timed in `lib/receiptPrint.ts`.
 *
 * The thank-you sits in the pinned footer, over the actions, rather than under
 * the slip: a slip with a few lines is taller than a phone, and a thank-you
 * below the fold is a moment that never visibly ends.
 *
 * None of it carries state or holds the client up. The slip's words are all
 * there from the first frame for a screen reader; any touch on the slip
 * finishes the print at once; reduce motion shows the slip already in place.
 * The actions are on screen from the first frame and are never animated.
 */
export function PrintedReceipt({ view, showServiceFee, thanks, actions }: Props) {
  const reducedMotion = useReducedMotion();
  const colors = useThemeColors();
  const theme = useThemeName();

  const start = printStartFrame(reducedMotion);
  const slipOffset = useSharedValue(start.slipOffset);
  const thanksOpacity = useSharedValue(start.thanksOpacity);
  // Set once the print has run, been skipped, or was never going to move.
  const settled = useRef(reducedMotion);

  const finish = () => {
    settled.current = true;
    cancelAnimation(slipOffset);
    cancelAnimation(thanksOpacity);
    slipOffset.value = PRINT_END_FRAME.slipOffset;
    thanksOpacity.value = PRINT_END_FRAME.thanksOpacity;
  };

  const onSlipLayout = (event: LayoutChangeEvent) => {
    if (settled.current) return;
    settled.current = true;
    const timing = { easing: FEED_EASING, reduceMotion: ReduceMotion.System };
    slipOffset.value = slipFeedFrom(event.nativeEvent.layout.height);
    slipOffset.value = withSequence(
      withTiming(PRINT_OVERSHOOT_PX, { ...timing, duration: PRINT_FEED_MS }),
      withTiming(0, { ...timing, duration: PRINT_SETTLE_MS }),
    );
    thanksOpacity.value = withDelay(
      THANKS_DELAY_MS,
      withTiming(1, { ...timing, duration: THANKS_FADE_MS }),
      ReduceMotion.System,
    );
  };

  // The platform answers "reduce motion?" asynchronously, so a phone that asks
  // for it can start with the print already running. Land it the moment it does.
  useEffect(() => {
    if (!reducedMotion) return;
    settled.current = true;
    cancelAnimation(slipOffset);
    cancelAnimation(thanksOpacity);
    slipOffset.value = PRINT_END_FRAME.slipOffset;
    thanksOpacity.value = PRINT_END_FRAME.thanksOpacity;
  }, [reducedMotion, slipOffset, thanksOpacity]);

  const slipStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slipOffset.value }],
  }));
  const thanksStyle = useAnimatedStyle(() => ({
    opacity: thanksOpacity.value,
    transform: [{ translateY: (1 - thanksOpacity.value) * THANKS_RISE_PX }],
  }));

  // The mouth of the slot is the darkest thing near it in either theme.
  const mouth = theme === "dark" ? colors.canvas : colors.accent;

  return (
    <>
      <ScrollView
        testID="receipt-print"
        className="gg-screen"
        contentContainerClassName="gg-page pb-10 pt-4"
        onTouchStart={finish}
      >
        <View
          className="z-10 h-5 justify-center rounded-pill border border-outline bg-surface-variant px-2.5"
          aria-hidden
        >
          <View className="h-1 rounded-pill" style={{ backgroundColor: mouth }} />
        </View>

        {view ? (
          <View className="-mt-2.5 mx-4 overflow-hidden pt-2.5">
            <Animated.View testID="receipt-slip-feed" style={slipStyle} onLayout={onSlipLayout}>
              <ReceiptSlip view={view} showServiceFee={showServiceFee} />
            </Animated.View>
            {/* The slot's shadow on the paper, so the slip reads as coming out of it. */}
            <View pointerEvents="none" className="absolute inset-x-0 top-0 h-6" aria-hidden>
              <Svg width="100%" height="100%">
                <Defs>
                  <LinearGradient id="slot-shadow" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0.4" stopColor={colors.textPrimary} stopOpacity={0.14} />
                    <Stop offset="1" stopColor={colors.textPrimary} stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#slot-shadow)" />
              </Svg>
            </View>
          </View>
        ) : (
          <Text className="pt-4 text-center text-caption text-text-muted">
            Printing your order summary…
          </Text>
        )}
      </ScrollView>

      <View className="gap-4 border-t border-outline bg-surface px-4 pb-2 pt-4">
        <Animated.View testID="receipt-thanks" style={thanksStyle}>
          {view ? thanks : null}
        </Animated.View>
        <View className="gap-2">{actions}</View>
      </View>
    </>
  );
}
