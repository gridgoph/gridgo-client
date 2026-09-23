import { Star } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { starWord } from "@/lib/rating";

/**
 * Five stars, and the word for what they mean.
 *
 * The word is not decoration. A row of shapes is a rating nobody can read back
 * — "four stars" says nothing about whether four is good here — and colour and
 * shape alone are not a state this product is allowed to communicate with. So
 * every value has a sentence, and the sentence is what a screen reader
 * announces.
 *
 * Each star is its own control rather than one strip with a gesture on it. A
 * drag across five targets is precise work on a phone, and a tap on the one
 * you mean is not.
 */
export function StarRating({
  value,
  onChange,
  label,
}: {
  /** 0 when nothing has been chosen yet. */
  value: number;
  onChange: (stars: number) => void;
  /** What is being rated, for the control's accessible name. */
  label: string;
}) {
  const colors = useThemeColors();

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= value;
          return (
            <Pressable
              key={star}
              onPress={() => onChange(star)}
              accessibilityRole="radio"
              accessibilityState={{ selected: star === value }}
              // The whole answer, not "star three of five": what a person
              // needs to hear is what picking this one would mean.
              accessibilityLabel={`${label}: ${star} ${star === 1 ? "star" : "stars"}, ${starWord(star)}`}
              hitSlop={4}
              className="gg-touch items-center justify-center"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <Star
                size={30}
                // Yellow is the product's attention budget, and a rating a
                // client is being asked to give is exactly what the screen
                // wants their attention on. An unfilled star stays outline.
                color={filled ? colors.actionYellow : colors.textMuted}
                fill={filled ? colors.actionYellow : "transparent"}
                strokeWidth={1.5}
              />
            </Pressable>
          );
        })}
      </View>
      <Text
        className={value ? "text-body text-text-primary" : "text-body text-text-muted"}
        // The stars already announce themselves; this would be the same news
        // twice on the way through.
        aria-hidden
      >
        {starWord(value)}
      </Text>
    </View>
  );
}
