import { Moon, Sun, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { useSession } from "@/store/session";
import { useThemeStore } from "@/store/theme";

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
 * theme you are not in, and a screen reader has to guess which.
 */
export function ThemeSwitch() {
  const theme = useThemeName();
  const userId = useSession((s) => s.user?.id ?? null);
  const choose = useThemeStore((s) => s.choose);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Theme"
      className="flex-row items-center rounded-pill border border-outline bg-surface p-0.5"
    >
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
      className={selected ? "h-11 w-11 items-center justify-center rounded-pill bg-accent" : "h-11 w-11 items-center justify-center rounded-pill"}
      style={({ pressed }) => (pressed && !selected ? { opacity: 0.6 } : undefined)}
    >
      <Icon size={20} strokeWidth={2} color={selected ? colors.accentOn : colors.textMuted} aria-hidden />
    </Pressable>
  );
}
