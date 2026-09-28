import { Text, View } from "react-native";

import { REFUND_STAGES, refundStageIndex } from "@/lib/refunds";

/**
 * Requested · Reviewed · Approved · Sent.
 *
 * The same segment language as the order's compact stage rail, so a refund
 * reads as part of the job rather than a form bolted on. Approved and Sent are
 * two stops, not one: a client looking at an approved refund can see the
 * segment that has not filled yet, which is the whole point. Filled versus
 * outlined, never colour alone.
 */
export function RefundStageRail({ status }: { status: string }) {
  const currentIndex = refundStageIndex(status);
  if (currentIndex == null) return null;
  const label = `Refund stage ${currentIndex + 1} of ${REFUND_STAGES.length}: ${REFUND_STAGES[currentIndex]}`;

  return (
    <View className="flex-row gap-1.5" accessibilityRole="progressbar" accessibilityLabel={label}>
      {REFUND_STAGES.map((stage, index) => {
        const reached = index <= currentIndex;
        const here = index === currentIndex;
        return (
          <View key={stage} className="flex-1 gap-1.5">
            <View className={reached ? "h-1 rounded-pill bg-accent" : "h-1 rounded-pill bg-outline"} />
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              className={
                here
                  ? "text-caption font-medium text-text-primary"
                  : reached
                    ? "text-caption text-text-secondary"
                    : "text-caption text-text-muted"
              }
            >
              {stage}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
