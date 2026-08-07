import { Text, View } from "react-native";

import { getOrderStateMeta } from "@/lib/orderState";
import { formatRelativeTime } from "@/lib/relativeTime";

export type TimelineEntry = {
  at: string;
  state: string;
  by: string;
  note: string;
};

type Props = {
  timeline: TimelineEntry[];
  /** Current order state — that step is the one yellow marker. */
  currentState: string;
};

/**
 * Order history from the API `timeline` array.
 * Current state is the single yellow step.
 */
export function OrderTimeline({ timeline, currentState }: Props) {
  if (!timeline.length) {
    return <Text className="text-body text-text-muted">No timeline events yet.</Text>;
  }

  return (
    <View className="gap-0">
      {timeline.map((entry, index) => {
        const meta = getOrderStateMeta(entry.state);
        const isCurrent = entry.state === currentState && index === timeline.length - 1;
        const isLast = index === timeline.length - 1;

        return (
          <View key={`${entry.at}-${entry.state}-${index}`} className="flex-row gap-3">
            <View className="items-center">
              <View
                className={
                  isCurrent
                    ? "h-3 w-3 rounded-pill bg-action-yellow"
                    : "h-3 w-3 rounded-pill border-2 border-outline bg-surface"
                }
              />
              {!isLast ? <View className="w-px flex-1 bg-outline" /> : null}
            </View>
            <View className={`flex-1 pb-4 ${isLast ? "pb-0" : ""}`}>
              <Text
                className={
                  isCurrent
                    ? "text-body font-medium text-text-primary"
                    : "text-body text-text-primary"
                }
              >
                {meta.label}
              </Text>
              <Text className="mt-0.5 text-caption text-text-muted">
                {formatRelativeTime(entry.at)}
                {entry.by ? ` · ${actorLabel(entry.by)}` : ""}
              </Text>
              {entry.note ? (
                <Text className="mt-1 text-body text-text-secondary">{entry.note}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function actorLabel(by: string): string {
  if (by === "system") return "System";
  if (by.startsWith("user_")) return by.replace("user_", "");
  return by;
}
