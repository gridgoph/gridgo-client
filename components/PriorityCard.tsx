import { Pressable, Text, View } from "react-native";
import { Easing, LinearTransition, ReduceMotion } from "react-native-reanimated";

import { priorityBlurb, priorityLabel, type Priority } from "@/lib/priorities";

/** A card moving to its new place. Ease-out inside the motion budget; still under reduce motion. */
export const PRIORITY_CARD_MOVE = LinearTransition.duration(200)
  .easing(Easing.out(Easing.cubic))
  .reduceMotion(ReduceMotion.System);

/**
 * One priority, and what ranking it first would cost.
 *
 * The numeral is the state: a placed card carries its rank in a filled accent
 * disc, an unplaced one carries an empty ring. Monochrome, because the yellow
 * on this screen belongs to the one button at the bottom, and because a ranking
 * has to be readable with no colour at all.
 *
 * `compact` drops the blurb to one row per priority — the per-job check
 * (`app/request/rank.tsx`), where the client already knows what each one means
 * from setting their usual order and only needs to see and move the order.
 */
export function PriorityCard({
  priority,
  rank,
  onPress,
  compact = false,
}: {
  priority: Priority;
  rank: number | null;
  onPress: () => void;
  compact?: boolean;
}) {
  const placed = rank != null;
  const shape = compact ? "flex-row items-center gap-4 py-3" : "flex-row gap-4";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={priorityLabel(priority)}
      accessibilityValue={placed ? { text: `Ranked ${rank}` } : { text: "Not ranked" }}
      accessibilityHint={
        placed ? "Removes it and anything ranked after it" : "Puts it next in your order"
      }
      className={placed ? `gg-panel-high ${shape}` : `gg-card ${shape}`}
      style={({ pressed }) => (pressed ? { opacity: 0.92 } : undefined)}
    >
      <View
        className={
          placed
            ? "h-8 w-8 items-center justify-center rounded-pill bg-accent"
            : "h-8 w-8 items-center justify-center rounded-pill border border-outline"
        }
        aria-hidden
      >
        <Text
          className={
            placed ? "text-body font-bold text-accent-on" : "text-body text-text-muted"
          }
        >
          {placed ? rank : "–"}
        </Text>
      </View>

      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-h3 text-text-primary">{priorityLabel(priority)}</Text>
        {compact ? null : (
          <Text className="text-body text-text-secondary">{priorityBlurb(priority)}</Text>
        )}
      </View>
    </Pressable>
  );
}
