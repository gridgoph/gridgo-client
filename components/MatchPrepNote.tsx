import { Text, View } from "react-native";

import {
  MATCH_PREP_STEPS,
  matchPrepAccessibilityLabel,
  type MatchPrepStepId,
} from "@/lib/orderSteps";

/**
 * One quiet line over the date, delivery and priority questions: these come
 * before the match, and they are what the match is made from.
 *
 * Not a second step bar. The step trail starts at the match itself; this only
 * says why the screens ahead of it ask what they ask, with the one being
 * answered set in ink. It never numbers them: a basket that already holds a
 * delivery choice skips that question, and a count that jumps is worse than none.
 */
export function MatchPrepNote({ current }: { current: MatchPrepStepId }) {
  return (
    <View
      className="mb-2"
      accessible
      accessibilityRole="text"
      accessibilityLabel={matchPrepAccessibilityLabel(current)}
    >
      <Text className="text-overline text-text-muted">
        {"BEFORE WE MATCH: "}
        {MATCH_PREP_STEPS.map((step, index) => (
          <Text
            key={step.id}
            className={step.id === current ? "font-bold text-text-primary" : undefined}
          >
            {index > 0 ? " · " : ""}
            {step.label.toUpperCase()}
          </Text>
        ))}
      </Text>
    </View>
  );
}
