import { Moon, Sun, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, type Ref } from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { knobTransitionName } from "@/lib/themeFade";
import { THEME_KNOB_MS } from "@/lib/themeTransition";
import { useSession } from "@/store/session";
import { switchTheme, useThemeSwitch } from "@/store/themeSwitch";

/** One half of the switch: a 44x44 button, so the knob travels one width. */
const HALF = 44;

/**
 * Light / dark, one tap from Home (client#335).
 *
 * The app follows the phone until the client taps this; the tap is then saved
 * on the account (`store/theme.ts`) and every screen follows it. The lit half
 * is the theme in effect now, so a client still on the phone's setting sees
 * which one that is. Monochrome on purpose: the knob is a routine control,
 * and Home's yellow belongs to the "+" and Featured Prints.
 *
 * Two real buttons, each 44x44, rather than one toggle: a toggle names the
 * theme you are not in, and a screen reader has to guess which. One knob sits
 * behind them and slides to the tapped half, at once, while the screen fades
 * to the new theme (`store/themeSwitch.ts`); under reduce motion it jumps.
 */
export function ThemeSwitch() {
  const onScreen = useThemeName();
  const wanted = useThemeSwitch((s) => s.wanted);
  const animate = useThemeSwitch((s) => s.animate);
  const userId = useSession((s) => s.user?.id ?? null);
  const theme = wanted ?? onScreen;

  // Where the browser draws the slide (`lib/themeFade.ts`), the knob jumps.
  const slides = animate && !knobTransitionName;
  const x = useSharedValue(theme === "dark" ? HALF : 0);
  useEffect(() => {
    const to = theme === "dark" ? HALF : 0;
    x.set(slides ? withTiming(to, { duration: THEME_KNOB_MS, easing: Easing.out(Easing.cubic) }) : to);
  }, [theme, slides, x]);
  const knobFace = useRef<View>(null);
  const sun = useRef<View>(null);
  const moon = useRef<View>(null);
  useEffect(() => {
    if (!knobTransitionName) return;
    nameForTransition(knobFace.current, knobTransitionName);
    // Named after the knob, so the browser draws them above it while it slides.
    nameForTransition(sun.current, `${knobTransitionName}-sun`);
    nameForTransition(moon.current, `${knobTransitionName}-moon`);
  }, []);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Theme"
      className="flex-row items-center rounded-pill border border-outline bg-surface p-0.5"
    >
      {/* Placed in the pill's 2pt padding; className stays off the Animated view. */}
      <Animated.View testID="theme-knob" pointerEvents="none" style={[{ position: "absolute", left: 2, top: 2 }, knob]}>
        <View ref={knobFace} className="h-11 w-11 rounded-pill bg-accent" />
      </Animated.View>
      <Half ref={sun} icon={Sun} label="Light theme" selected={theme === "light"} onPress={() => void switchTheme("light", userId)} />
      <Half ref={moon} icon={Moon} label="Dark theme" selected={theme === "dark"} onPress={() => void switchTheme("dark", userId)} />
    </View>
  );
}

/** React Native Web hands back the DOM node; `view-transition-name` is a web-only style. */
function nameForTransition(view: View | null, name: string) {
  const node = view as unknown as { style?: { viewTransitionName?: string } } | null;
  if (node?.style) node.style.viewTransitionName = name;
}

function Half({
  ref,
  icon: Icon,
  label,
  selected,
  onPress,
}: {
  ref: Ref<View>;
  icon: LucideIcon;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      ref={ref}
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
