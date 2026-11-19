import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";

import { guideStep, type GuideStepId } from "@/lib/expressGuide";
import { useExpressGuide } from "@/store/expressGuide";

const SETTLE_MS = [0, 120, 320];
const REMEASURE_MS = 400;

/**
 * Marks the real control a How to order tip lights (gridgo-client#441). The
 * same measuring rules as `TourTarget`: layout-neutral, measured only while
 * its tip is up, and re-measured while a pushed screen slides in.
 */
export function GuideTarget({
  step,
  children,
  style,
  className,
}: {
  step: GuideStepId;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const ref = useRef<View>(null);
  const active = useExpressGuide((s) => guideStep(s.progress)?.id === step);
  const { width, height } = useWindowDimensions();

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, w, h) => {
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
      useExpressGuide.getState().setRect(step, { x, y, width: w, height: h });
    });
  }, [step]);

  useEffect(() => {
    useExpressGuide.getState().mount(step);
    return () => useExpressGuide.getState().unmount(step);
  }, [step]);

  useEffect(() => {
    if (!active) return;
    const timers = SETTLE_MS.map((delay) => setTimeout(measure, delay));
    const interval = setInterval(measure, REMEASURE_MS);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
      useExpressGuide.getState().clearRect(step);
    };
  }, [active, measure, step, width, height]);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={style}
      className={className}
      onLayout={() => {
        if (active) measure();
      }}
    >
      {children}
    </View>
  );
}
