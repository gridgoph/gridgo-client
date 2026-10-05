import { CalendarClock, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { SeasonLevelTag, useSeasonTrackColour } from "@/components/SeasonLevelTag";
import { useThemeColors } from "@/hooks/useTheme";
import { bannerHeadline, seasonRange, type SeasonWindow } from "@/lib/seasonWindows";

/**
 * Home's heads-up, six to four weeks before a season opens.
 *
 * A card in the quiet register, not a yellow strip: Home's one yellow is the
 * "+", and a season is something to know rather than something to do. The
 * mark sits on the season's own track colour, so the card and the shaded
 * days on the deadline calendar read as the same thing. It never blocks or
 * links anywhere a client did not ask to go; the one control is the close.
 */
export function SeasonBanner({
  window,
  today,
  onDismiss,
}: {
  window: SeasonWindow;
  today: string;
  onDismiss: () => void;
}) {
  const colors = useThemeColors();
  const track = useSeasonTrackColour();
  const headline = bannerHeadline(window, today);

  return (
    <View className="gg-card-flush flex-row gap-3 py-4 pl-4 pr-1">
      <View
        className="items-center justify-center rounded-pill"
        style={{ width: 40, height: 40, backgroundColor: track(window.demandLevel) }}
      >
        <CalendarClock size={20} color={colors.textPrimary} strokeWidth={2} />
      </View>

      <View className="min-w-0 flex-1 pt-0.5">
        <Text className="text-body-lg font-bold text-text-primary">{headline}</Text>
        <View className="mt-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <SeasonLevelTag level={window.demandLevel} />
          <Text className="text-caption text-text-muted">{seasonRange(window)}</Text>
        </View>
        {window.message ? (
          <Text className="mt-2 text-body text-text-secondary">{window.message}</Text>
        ) : null}
      </View>

      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={`Dismiss the ${window.name} notice`}
        hitSlop={4}
        className="gg-touch items-center justify-center"
        style={({ pressed }) => ({ width: 44, height: 44, opacity: pressed ? 0.6 : 1 })}
      >
        <X size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
