import { ChevronRight, MapPin } from "lucide-react-native";
import { Linking, Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { HubPickup, HubSchedule } from "@/lib/api";
import { GRIDGO_OFFICE, GRIDGO_OFFICE_LABEL, gridgoOfficeMapUrl } from "@/lib/gridgoOffice";
import {
  HUB_HOURS_UNSET,
  hubFeeLabel,
  hubHoursLines,
  openWeekdays,
  upcomingClosureLines,
} from "@/lib/hubPickup";

/**
 * GRIDGO Office as a pick-up hub: where it is, when it is open, and what
 * collecting costs — all from GRIDGO's settings, or from the order's own
 * snapshot once it is placed (gridgo-api#148).
 *
 * The week strip is the one thing a client glances for ("can I go on
 * Thursday?"), so the open days are marked at a glance and the hours follow in
 * words; a screen reader hears the words. With no hours set there is no strip
 * at all — an empty week would read as "closed every day".
 */
export function HubPickupPanel({
  hub,
  showFee = true,
}: {
  hub: HubPickup | null | undefined;
  /** Off where the fee is already its own row, as on checkout's money card. */
  showFee?: boolean;
}) {
  const colors = useThemeColors();
  const fee = showFee ? hubFeeLabel(hub?.feeMinor) : null;
  const hours = hubHoursLines(hub?.schedule);
  const closures = upcomingClosureLines(hub?.schedule);

  return (
    <View className="gg-panel gap-4">
      <View className="flex-row items-start gap-2">
        <MapPin size={16} color={colors.textPrimary} strokeWidth={2} aria-hidden />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body font-medium text-text-primary">{GRIDGO_OFFICE_LABEL}</Text>
          <Text className="text-caption text-text-muted">{GRIDGO_OFFICE.locality}</Text>
        </View>
        {fee ? (
          <Text className="text-body font-medium text-text-primary" accessibilityLabel={`Pick-up fee: ${fee}`}>
            {fee}
          </Text>
        ) : null}
      </View>

      {hours ? (
        <View className="gap-2">
          <HubWeek schedule={hub?.schedule ?? null} />
          {hours.map((line) => (
            <Text key={line} className="text-body text-text-secondary">
              {line}
            </Text>
          ))}
          {closures.map((line) => (
            <Text key={line} className="text-caption text-warning">
              {line}
            </Text>
          ))}
        </View>
      ) : (
        <Text className="text-body text-text-secondary">{HUB_HOURS_UNSET}</Text>
      )}

      <Pressable
        onPress={() => void Linking.openURL(gridgoOfficeMapUrl())}
        accessibilityRole="button"
        accessibilityLabel="Open GRIDGO Office in Maps"
        className="gg-touch flex-row items-center gap-1 self-start"
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <Text className="text-button text-text-primary">Open in Maps</Text>
        <ChevronRight size={16} color={colors.textMuted} strokeWidth={2.5} aria-hidden />
      </Pressable>
    </View>
  );
}

const STRIP = [
  { weekday: 1, letter: "M" },
  { weekday: 2, letter: "T" },
  { weekday: 3, letter: "W" },
  { weekday: 4, letter: "T" },
  { weekday: 5, letter: "F" },
  { weekday: 6, letter: "S" },
  { weekday: 0, letter: "S" },
] as const;

/** Seven discs, Monday first; open days filled. Decoration for sight — the lines say it in words. */
function HubWeek({ schedule }: { schedule: HubSchedule | null }) {
  const open = openWeekdays(schedule);
  return (
    <View className="flex-row gap-1.5" aria-hidden importantForAccessibility="no-hide-descendants">
      {STRIP.map((day) => {
        const isOpen = open.has(day.weekday);
        return (
          <View
            key={day.weekday}
            className={
              isOpen
                ? "h-8 w-8 items-center justify-center rounded-pill bg-accent"
                : "h-8 w-8 items-center justify-center rounded-pill border border-outline"
            }
          >
            <Text className={isOpen ? "text-caption font-bold text-accent-on" : "text-caption text-text-muted"}>
              {day.letter}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
