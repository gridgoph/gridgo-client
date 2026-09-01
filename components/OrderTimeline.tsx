import { Text, View } from "react-native";

import { actorLabel } from "@/lib/copy";
import { getOrderStateMeta } from "@/lib/orderState";
import { formatRelativeTime, formatTimelineStamp } from "@/lib/relativeTime";

export type TimelineEntry = {
  at: string;
  state: string;
  by: string;
  note: string;
};

type Props = {
  timeline?: TimelineEntry[] | null;
  /** Current order state — that step is the one yellow marker. */
  currentState: string;
  /**
   * How the order reaches the client. The travel steps read differently to
   * somebody collecting: they are never told a job is out for delivery to
   * them when a rider is only moving it to GRIDGO's own counter.
   */
  fulfillmentMode?: string | null;
};

/**
 * The order's history: who acted, when, and what they said.
 *
 * A timeline is genuinely chronological and causal, so its ordering carries
 * real meaning — and the accountability this product exists to provide is the
 * actor and the clock time on every entry, not just a status word.
 */
export function OrderTimeline({ timeline, currentState, fulfillmentMode }: Props) {
  const entriesIn = Array.isArray(timeline) ? timeline : [];
  if (!entriesIn.length) {
    return (
      <Text className="text-body text-text-muted">
        Nothing has happened on this job yet. Every step, and who took it, appears here.
      </Text>
    );
  }

  // Newest first: what just happened is what a client came to read.
  const entries = [...entriesIn].reverse();

  return (
    <View className="gap-0">
      {entries.map((entry, index) => {
        const meta = getOrderStateMeta(entry.state, fulfillmentMode);
        const isCurrent = index === 0 && entry.state === currentState;
        const isLast = index === entries.length - 1;

        return (
          <View key={`${entry.at}-${entry.state}-${index}`} className="flex-row gap-3">
            <View className="items-center">
              {/* Ink, not yellow. The order screen already spends its one
                  yellow on the action it is asking for — a proof decision, a
                  payment — and a second yellow forty lines below it competes
                  with that. "You are here" is carried by a filled disc against
                  hollow ones and a heavier label, which also reads in
                  greyscale. */}
              <View
                className={
                  isCurrent
                    ? "h-3 w-3 rounded-pill bg-accent"
                    : "h-3 w-3 rounded-pill border-2 border-outline bg-surface"
                }
              />
              {!isLast ? <View className="w-px flex-1 bg-outline" /> : null}
            </View>
            <View className={isLast ? "flex-1 pb-0" : "flex-1 pb-5"}>
              <Text
                className={
                  isCurrent
                    ? "text-body-lg font-medium text-text-primary"
                    : "text-body-lg text-text-primary"
                }
              >
                {meta.label}
              </Text>
              <Text className="mt-0.5 text-caption text-text-muted">
                {entry.by ? `${actorLabel(entry.by)} · ` : ""}
                {formatTimelineStamp(entry.at)} · {formatRelativeTime(entry.at)}
              </Text>
              {entry.note ? (
                <Text className="mt-1.5 text-body text-text-secondary" selectable>
                  {entry.note}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
