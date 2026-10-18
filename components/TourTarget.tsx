import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";

import { useTourStepActive } from "@/hooks/useTourStep";
import type { TourStepId } from "@/lib/tour";
import { useTour } from "@/store/tour";

/**
 * Marks the real control a tour step lights. It adds no chrome of its own —
 * the wrapper is layout-neutral apart from `collapsable={false}`, which Android
 * needs to keep a view it can measure.
 *
 * It says it is mounted, so the overlay can tell a control still being
 * measured from one this screen never drew. It measures only while its step is
 * the one on screen, and keeps measuring until the step changes: a pushed
 * screen is still sliding in when it gains focus, Home scrolls its section
 * into view, and a strip loading above it moves it without a layout event of
 * its own — a single early reading lit the wrong row.
 */
const SETTLE_MS = [0, 120, 320];
const REMEASURE_MS = 400;

export function TourTarget({
  step,
  children,
  style,
  className,
  testID,
  onLayout,
}: {
  step: TourStepId;
  testID?: string;
  /** The target's own offset in its parent, for a screen that scrolls it into view. */
  onLayout?: (y: number) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const ref = useRef<View>(null);
  const active = useTourStepActive(step);
  const { width, height } = useWindowDimensions();

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, w, h) => {
      // Some phones answer before layout with zeros or nothing at all.
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
      useTour.getState().setRect(step, { x, y, width: w, height: h });
    });
  }, [step]);

  useEffect(() => {
    useTour.getState().mount(step);
    return () => useTour.getState().unmount(step);
  }, [step]);

  useEffect(() => {
    if (!active) return;
    const timers = SETTLE_MS.map((delay) => setTimeout(measure, delay));
    const interval = setInterval(measure, REMEASURE_MS);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
      useTour.getState().clearRect(step);
    };
  }, [active, measure, step, width, height]);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={style}
      className={className}
      testID={testID}
      onLayout={(event) => {
        onLayout?.(event.nativeEvent.layout.y);
        if (active) measure();
      }}
    >
      {children}
    </View>
  );
}
