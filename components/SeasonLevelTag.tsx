import { Text, View } from "react-native";

import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { levelLabel, type DemandLevel } from "@/lib/seasonWindows";

/**
 * How strongly a season's track is painted, per level and theme.
 *
 * One hue — the `info` token — at three strengths, never three colours. A
 * season is a heads-up, not a warning: amber would be read against the yellow
 * "tight" discs it sits behind, and red is the shop's word for a full queue,
 * which the calendar deliberately never says to a client. Strength alone
 * also survives grayscale, and the level word always rides beside it.
 */
const TRACK_ALPHA = {
  light: { Normal: 0.14, Busy: 0.3, Peak: 0.5 },
  dark: { Normal: 0.24, Busy: 0.42, Peak: 0.64 },
} as const;

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** The track colour a season day is shaded with. */
export function useSeasonTrackColour(): (level: DemandLevel) => string {
  const colors = useThemeColors();
  const theme = useThemeName() === "dark" ? "dark" : "light";
  return (level) => withAlpha(colors.info, TRACK_ALPHA[theme][level]);
}

/**
 * The level, said in words beside the shade it is painted in.
 *
 * Colour never carries a status alone in this product, so wherever a season's
 * track appears its level appears too: "Peak", "Busy", "Normal".
 */
export function SeasonLevelTag({ level }: { level: DemandLevel }) {
  const track = useSeasonTrackColour();

  return (
    <View className="flex-row items-center gap-1.5">
      <View style={{ width: 18, height: 10, borderRadius: 999, backgroundColor: track(level) }} />
      <Text className="text-caption font-medium text-text-secondary">{levelLabel(level)}</Text>
    </View>
  );
}
