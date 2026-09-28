import type { ReactNode } from "react";
import { Text, View } from "react-native";

import type { HistoryRow } from "@/lib/orderHistory";
import { formatRelativeTime, formatTimelineStamp } from "@/lib/relativeTime";

type Props = {
  /** `historyRows(...)`, oldest first as the payload stores them. */
  rows: readonly HistoryRow[];
  /** Current order state — that step is the one filled marker. */
  currentState: string;
  /** What sits under a step: the photos taken during it, say. */
  renderBelow?: (row: HistoryRow) => ReactNode;
};

/**
 * The order's history: what happened, and when.
 *
 * A timeline is genuinely chronological and causal, so its ordering carries
 * real meaning, and every entry carries the real clock time as well as a
 * status word. What a row may say is `lib/orderHistory.ts`: never a shop's
 * payout, a milestone or an internal code.
 */
export function OrderTimeline({ rows, currentState, renderBelow }: Props) {
  if (!rows.length) {
    return (
      <Text className="text-body text-text-muted">
        Nothing has happened on this job yet. Every step, and who took it, appears here.
      </Text>
    );
  }

  // Newest first: what just happened is what a client came to read.
  const entries = [...rows].reverse();
  const current = currentState === "payout_released" ? "completed" : currentState;

  return (
    <View className="gap-0">
      {entries.map((entry, index) => {
        const isCurrent = index === 0 && entry.state === current;
        const isLast = index === entries.length - 1;

        return (
          <View key={entry.key} className="flex-row gap-3">
            {/* The disc sits on the title's first line, not above it. */}
            <View className="items-center pt-1.5">
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
                {entry.title}
              </Text>
              <Text className="mt-0.5 text-caption text-text-muted">
                {entry.actor ? `${entry.actor} · ` : ""}
                {formatTimelineStamp(entry.at)} · {formatRelativeTime(entry.at)}
              </Text>
              {renderBelow ? renderBelow(entry) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
