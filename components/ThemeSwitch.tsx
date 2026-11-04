import { Moon, Sun, type LucideIcon } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { useSession } from "@/store/session";
import { useThemeStore } from "@/store/theme";

/** One half of the switch: a 44x44 button, so the knob travels one width. */
const HALF = 44;
/** The knob sliding from sun to moon. */
const KNOB_MS = 240;

/**
 * Light / dark, one tap from the header of every tab (client#335).
 *
 * The app follows the phone until the client taps this; the tap is then saved
 * on the account (`store/theme.ts`) and every screen follows it. The lit half
 * is the theme in effect now, so a client still on the phone's setting sees
 * which one that is. Monochrome on purpose: the knob is a routine control,
 * and Home's yellow belongs to the "+" and Featured Prints.
 *
 * Two real buttons, each 44x44, rather than one toggle: a toggle names the
 * theme you are not in, and a screen reader has to guess which. One knob sits
 * behind them and slides to the tapped half; under reduce motion it jumps.
 *
 * The tap changes the theme exactly as Settings does: `choose` lands it in
 * place, in one frame, on every screen. Nothing is drawn over the screen and
 * nothing cross-fades. A light/dark blend passes every colour through the same
 * grey at the same moment, so text sinks into its background and the screen
 * reads as fogged over; the earlier wash and snapshot fade both did that.
 */
export function ThemeSwitch() {
  const theme = useThemeName();
  const reduced = useReducedMotion();
  const choose = useThemeStore((s) => s.choose);
  const userId = useSession((s) => s.user?.id ?? null);

  const x = useSharedValue(theme === "dark" ? HALF : 0);
  useEffect(() => {
    const to = theme === "dark" ? HALF : 0;
    x.set(reduced ? to : withTiming(to, { duration: KNOB_MS, easing: Easing.out(Easing.cubic) }));
  }, [theme, reduced, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Theme"
      className="flex-row items-center rounded-pill border border-outline bg-surface p-0.5"
    >
      {/* Placed in the pill's 2pt padding; className stays off the Animated view. */}
      <Animated.View testID="theme-knob" pointerEvents="none" style={[{ position: "absolute", left: 2, top: 2 }, knob]}>
        <View className="h-11 w-11 rounded-pill bg-accent" />
      </Animated.View>
      <Half icon={Sun} label="Light theme" selected={theme === "light"} onPress={() => void choose("light", userId)} />
      <Half icon={Moon} label="Dark theme" selected={theme === "dark"} onPress={() => void choose("dark", userId)} />
    </View>
  );
}

function Half({
  icon: Icon,
  label,
  selected,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      className="h-11 w-11 items-center justify-center rounded-pill"
      style={({ pressed }) => (pressed && !selected ? { opacity: 0.6 } : undefined)}
    >
      <Icon size={20} strokeWidth={2} color={selected ? colors.accentOn : colors.textMuted} aria-hidden />
    </Pressable>
  );
}
