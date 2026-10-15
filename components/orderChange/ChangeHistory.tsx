import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import type { Order } from "@/lib/api";
import { changeItemName, settledChangeLabel, settledChanges } from "@/lib/orderChanges";
import { readyByDate } from "@/lib/readyTime";
import { formatTimelineStamp } from "@/lib/relativeTime";

/**
 * Every change the shop asked for and how it ended, newest first: the record
 * under the specification. Open requests are the action zone's, not this.
 */
export function ChangeHistory({ order }: { order: Order }) {
  const rows = settledChanges(order);
  if (!rows.length) return null;
  return (
    <View className="gap-2 pt-4">
      <Text className="text-body font-medium text-text-primary">Change requests</Text>
      {rows.map((change) => {
        const applied = change.status === "applied";
        const itemName = changeItemName(order, change.lineItemId);
        const date = readyByDate(change.proposedPromiseBy);
        const at = change.appliedAt ?? change.closedAt ?? change.answeredAt ?? change.createdAt;
        return (
          <View key={change.id} className="gap-1.5 border-b border-outline-subtle py-3">
            <View className="flex-row">
              <StatusChip
                tone={applied ? "success" : "neutral"}
                icon={applied ? "circle-check" : "circle-x"}
                label={settledChangeLabel(change)}
              />
            </View>
            {change.proposedSpec?.trim() ? (
              <Text className="text-body text-text-primary">{change.proposedSpec}</Text>
            ) : null}
            {date ? (
              <Text className="text-body text-text-secondary">
                {applied ? `New ready date: ${date}` : `Asked to move the ready date to ${date}`}
              </Text>
            ) : null}
            <Text className="text-caption text-text-muted">
              {[itemName, formatTimelineStamp(at)].filter(Boolean).join(" · ")}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
