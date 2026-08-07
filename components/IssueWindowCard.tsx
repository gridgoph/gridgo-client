import { Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import type { Order } from "@/lib/api";

type Props = {
  order: Order;
};

/**
 * 24h issue window after delivery.
 * No report endpoint in the pilot — action stays visibly unavailable with reason.
 */
export function IssueWindowCard({ order }: Props) {
  const openedAt = [...order.timeline]
    .reverse()
    .find((e) => e.state === "issue_window_open")?.at;

  return (
    <View className="gg-card gap-3">
      <Text className="text-h3 text-text-primary">Report a material issue</Text>
      <StatusChip tone="warning" label="24-hour window open" icon="triangle-alert" />
      <Text className="text-body text-text-secondary">
        You have 24 hours after delivery to report a material defect.
        {openedAt
          ? ` Window opened ${new Date(openedAt).toLocaleString("en-PH")}.`
          : ""}
      </Text>
      <SecondaryButton label="Report issue" disabled onPress={() => undefined} />
      <Text className="text-caption text-text-muted">
        Reporting is not available yet in this pilot. Contact Operations if you need to
        open a claim before this control is enabled.
      </Text>
    </View>
  );
}
