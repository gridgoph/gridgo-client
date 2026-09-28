import { Text, View } from "react-native";

import { historyRows, type HistoryEntry } from "@/lib/orderHistory";
import { formatRelativeTime, formatTimelineStamp } from "@/lib/relativeTime";

type Props = {
  timeline?: HistoryEntry[] | null;
  /** Current order state — that step is the one yellow marker. */
  currentState: string;
  /**
   * How the order reaches the client. The travel steps read differently to
   * somebody collecting: they are never told a job is out for delivery to
   * them when a rider is only moving it to GRIDGO's own counter.
   */
  fulfillmentMode?: string | null;
  /**
   * `paysInFull(order)`: the payment steps of an order paid in full up front
   * never call its one payment a downpayment.
   */
  paidInFull?: boolean;
  /**
   * `hasPlainHistory(order)`: the notes are GRIDGO's plain wording and may be
   * drawn. False for an older payload, whose notes were internal free text.
   */
  plainNotes?: boolean;
};

/**
 * The order's history: what happened, and when.
 *
 * A timeline is genuinely chronological and causal, so its ordering carries
 * real meaning, and every entry carries the real clock time as well as a
 * status word. What a row may say is `lib/orderHistory.ts`: never a shop's
 * payout, a milestone or an internal code.
 */
export function OrderTimeline({
  timeline,
  currentState,
  fulfillmentMode,
  paidInFull = false,
  plainNotes = false,
}: Props) {
  const rows = historyRows(timeline, { plainNotes, fulfillmentMode, paidInFull });
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
                {entry.title}
              </Text>
              <Text className="mt-0.5 text-caption text-text-muted">
                {entry.actor ? `${entry.actor} · ` : ""}
                {formatTimelineStamp(entry.at)} · {formatRelativeTime(entry.at)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
