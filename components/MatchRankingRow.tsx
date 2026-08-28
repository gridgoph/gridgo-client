import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { priorityLabel, type PriorityRanking } from "@/lib/priorities";

type Props = {
  ranking: PriorityRanking | null;
  onChange: () => void;
};

/**
 * Why this shop, in three chips.
 *
 * It used to be one grey sentence — "Matched on quality, then speed, then
 * distance · change" — which is the whole answer buried in a line nobody
 * reads at 12px. A client scanning this screen wants two things: what decided
 * it, and how to argue with it. So the ranking becomes three ordered chips
 * they can take in at a glance, and Change becomes a control that looks like
 * one.
 *
 * The numerals earn their place here in a way they do not on the step trail:
 * the rank *is* the information. First beat second, and that is the sentence
 * the whole match rests on.
 *
 * Monochrome. The yellow on this screen belongs to nothing yet — the client
 * commits on the listing sheet — and an explanation is never the action.
 */
export function MatchRankingRow({ ranking, onChange }: Props) {
  const colors = useThemeColors();

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-overline text-text-muted">MATCHED ON</Text>
        <Pressable
          onPress={onChange}
          accessibilityRole="button"
          accessibilityLabel="Change what GRIDGO matches on"
          className="gg-touch flex-row items-center justify-end gap-1 pl-3"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-primary">Change</Text>
          <ChevronRight
            size={16}
            color={colors.textPrimary}
            strokeWidth={2.5}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Pressable>
      </View>

      {ranking ? (
        <View className="flex-row flex-wrap gap-2">
          {ranking.map((priority, index) => (
            <View
              key={priority}
              className="gg-chip bg-surface"
              accessibilityRole="text"
              accessibilityLabel={`${index + 1}: ${priorityLabel(priority)}`}
            >
              <Text className="text-caption text-text-muted">{index + 1}</Text>
              <Text className="text-caption font-medium text-text-primary">
                {priorityLabel(priority)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-caption text-text-secondary">
          You have not told GRIDGO what to put first yet.
        </Text>
      )}
    </View>
  );
}
