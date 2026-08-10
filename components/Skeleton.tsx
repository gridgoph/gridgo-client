import { useEffect, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Placeholder shapes shown while a screen's real content is on its way.
 *
 * A highlight sweeps across each shape roughly once a second. That is the
 * loading language GRIDGO already had, and it is what makes a slow screen read
 * as "still working" rather than "stopped". It sits outside the 160–240ms
 * motion budget on purpose: that budget governs a transition — a step landing,
 * an order changing state — and an *opacity pulse* fast enough to obey it would
 * strobe, which is why this file previously refused to move at all. A
 * translating highlight at ~1.1s is not a transition and does not strobe.
 *
 * Nothing here carries state. Every skeleton is accompanied by a line of copy
 * saying what is loading, and with reduce motion on the sweep is simply absent
 * while the shapes stay — so the layout still holds and nothing is said by
 * motion alone.
 *
 * Shapes are named for what they stand in for, and compositions are built per
 * screen, so the page keeps its height while the data lands instead of jumping
 * when it arrives.
 */

/** One pass of the highlight. Slow enough to read as ambient, not as a blink. */
const SWEEP_MS = 1100;

/**
 * The sweep itself: a soft band of the highlight colour travelling left to
 * right inside whatever shape contains it.
 *
 * The band is drawn with an SVG gradient because a hard-edged block reads as a
 * bar sliding past rather than as light moving over a surface. It is clipped by
 * the parent's `overflow: hidden` and radius, so it takes the shape's corners.
 */
function Sweep() {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.linear }),
      -1,
    );
  }, [progress, reducedMotion]);

  const band = useAnimatedStyle(() => ({
    transform: [{ translateX: -width + progress.value * width * 2 }],
  }));

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  // Reduce motion keeps the shape and drops the light. The placeholder still
  // holds the layout, and the copy beside it still says what is loading.
  if (reducedMotion) return null;

  // The band is as wide as the shape and starts one width to the left of it,
  // so before the first layout it is simply zero wide — nothing to see, and no
  // flash of a full-strength highlight parked on the left edge.
  return (
    <View onLayout={onLayout} pointerEvents="none" className="absolute inset-0">
      <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, width }, band]}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="gg-skeleton-sweep" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.surfaceHigh} stopOpacity={0} />
              <Stop offset="0.5" stopColor={colors.surfaceHigh} stopOpacity={1} />
              <Stop offset="1" stopColor={colors.surfaceHigh} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#gg-skeleton-sweep)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

type LineProps = {
  /** Tailwind width utility — skeleton lines are ragged, not uniform. */
  width: string;
  /** Height utility. Defaults to a body line. */
  height?: string;
};

/** A line of text that has not arrived yet. */
export function SkeletonLine({ width, height = "h-4" }: LineProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`${width} ${height} overflow-hidden rounded-sm bg-surface-variant`}
    >
      <Sweep />
    </View>
  );
}

/** A pill — a status chip, a filter, a badge. */
export function SkeletonPill({ width = "w-28" }: { width?: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`${width} h-7 overflow-hidden rounded-pill bg-surface-variant`}
    >
      <Sweep />
    </View>
  );
}

/** A card-shaped placeholder: a heading line, a body line, a short meta line. */
export function SkeletonCard() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="gg-card gap-3"
    >
      <SkeletonLine width="w-2/3" height="h-5" />
      <SkeletonLine width="w-full" />
      <SkeletonLine width="w-1/3" height="h-3" />
    </View>
  );
}

/** `count` card placeholders with the list's own rhythm. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </View>
  );
}

/**
 * An `OrderCard` that has not arrived yet, shape for shape: state chip, title,
 * specification line, money row.
 *
 * Matching the real card matters more here than anywhere else. Home and Orders
 * are what a client opens the app to see, and a placeholder of the wrong height
 * makes the list visibly resettle when the data lands — which is the "it jumps"
 * feeling, not a screen transition.
 */
export function SkeletonOrderCard() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="gg-card"
    >
      <View className="flex-row">
        <SkeletonPill />
      </View>
      <View className="mt-3">
        <SkeletonLine width="w-3/4" height="h-5" />
      </View>
      <View className="mt-1">
        <SkeletonLine width="w-1/2" height="h-4" />
      </View>
      <View className="mt-3 flex-row items-center justify-between gap-3">
        <SkeletonLine width="w-24" height="h-5" />
        <SkeletonLine width="w-20" height="h-4" />
      </View>
    </View>
  );
}

/** `count` order rows, holding the list's height while it loads. */
export function SkeletonOrderList({ count = 3 }: { count?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonOrderCard key={index} />
      ))}
    </View>
  );
}
