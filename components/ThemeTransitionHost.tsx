import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { colors } from "@/constants/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { THEME_VEIL_IN_MS, THEME_VEIL_OUT_MS } from "@/lib/themeTransition";
import { useThemeSwitch } from "@/store/themeSwitch";

/**
 * Drawn once, above every screen: the phone's wash during a light/dark switch
 * (`lib/themeFade.native.ts`), and the reduce-motion setting the switch obeys.
 * It never takes a touch, so a second tap mid-switch reaches the switch.
 * The web build never raises a wash; it cross-fades a snapshot instead.
 */
export function ThemeTransitionHost() {
  const reduced = useReducedMotion();
  const veil = useThemeSwitch((state) => state.veil);
  const opacity = useSharedValue(0);

  useEffect(() => {
    useThemeSwitch.setState({ animate: !reduced });
  }, [reduced]);

  const phase = veil?.phase ?? null;
  useEffect(() => {
    if (phase === "in") {
      opacity.set(withTiming(1, { duration: THEME_VEIL_IN_MS, easing: Easing.inOut(Easing.quad) }));
    } else if (phase === "out") {
      opacity.set(withTiming(0, { duration: THEME_VEIL_OUT_MS, easing: Easing.out(Easing.quad) }));
    } else {
      opacity.set(0);
    }
  }, [phase, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  if (!veil) return null;
  return (
    <Animated.View
      testID="theme-veil"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors[veil.to].canvas }, style]}
    />
  );
}
