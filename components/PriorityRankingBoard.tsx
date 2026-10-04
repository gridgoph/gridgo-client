import { CircleAlert, RotateCcw } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { PRIORITY_CARD_MOVE, PriorityCard } from "@/components/PriorityCard";
import { useThemeColors } from "@/hooks/useTheme";
import { displayOrder, rankOf, rankingSentence, type Priority } from "@/lib/priorities";

/**
 * The four priority cards, the order read back in words, and a save failure.
 *
 * Shared by the ranking screen (`app/priorities.tsx`) and the last page of
 * onboarding, so the ranking a client first sets is drawn by the same control
 * they later change it with. The save button is the caller's: on the screen it
 * sits under the board, in onboarding it is the pager's one yellow button.
 *
 * Cards are drawn in rank order (`displayOrder`), so the numerals always count
 * down the screen (gridgo-client#127).
 */
export function PriorityRankingBoard({
  order,
  onPlace,
  onReset,
  saveError,
  saving,
}: {
  order: readonly Priority[];
  onPlace: (priority: Priority) => void;
  onReset: () => void;
  saveError: string | null;
  saving: boolean;
}) {
  const colors = useThemeColors();

  return (
    <View>
      <View className="gap-3">
        {displayOrder(order).map((priority) => (
          <Animated.View key={priority} layout={PRIORITY_CARD_MOVE}>
            <PriorityCard
              priority={priority}
              rank={rankOf(order, priority)}
              onPress={() => onPlace(priority)}
            />
          </Animated.View>
        ))}
      </View>

      {/*
        The order read back in words. Someone who tapped the cards in a
        hurry checks this line, not the numerals — and it is the same sentence
        the match card will echo.
      */}
      <View className="mt-6 flex-row items-start justify-between gap-3">
        <Text className="min-w-0 flex-1 text-body text-text-secondary">
          {rankingSentence(order)}
        </Text>
        {order.length ? (
          <Pressable
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel="Start the ranking over"
            className="gg-touch flex-row items-center gap-1.5 px-1"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <RotateCcw size={14} color={colors.textSecondary} strokeWidth={2} aria-hidden />
            <Text className="text-caption text-text-secondary">Start over</Text>
          </Pressable>
        ) : null}
      </View>

      {/*
        Right above the button that retries it, and said as a state — icon,
        label, reason — so a client knows the order on screen is not the one
        GRIDGO holds yet.
      */}
      {saveError && !saving ? (
        <View
          className="mt-6 flex-row items-start gap-3"
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Not saved. ${saveError}`}
        >
          <CircleAlert size={20} color={colors.error} strokeWidth={2} aria-hidden />
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-body font-bold text-error">Not saved</Text>
            <Text className="text-body text-text-secondary">{saveError}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
