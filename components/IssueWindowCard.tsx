import { Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import type { Order } from "@/lib/api";

type Props = {
  order: Order;
};

/**
 * 24h issue window after delivery.
 * There is no report endpoint in the demo API — action stays visibly unavailable.
 */
export function IssueWindowCard({ order }: Props) {
  const openedAt = [...order.timeline]
    .reverse()
    .find((e) => e.state === "issue_window_open")?.at;

  return (
    <View className="gg-card gap-3">
      <Text className="text-h3 text-text-primary">Material issue window</Text>
      <StatusChip tone="warning" label="24-hour window open" icon="triangle-alert" />
      <Text className="text-body text-text-secondary">
        You can report a material defect within 24 hours of delivery.
        {openedAt
          ? ` Window opened ${new Date(openedAt).toLocaleString("en-PH")}.`
          : ""}
      </Text>
      <SecondaryButton label="Report issue" disabled onPress={() => undefined} />
      <Text className="text-caption text-text-muted">
        Reporting is not available in this demo build — the API has no issue-report
        endpoint yet. When it lands, this control will submit a material claim.
      </Text>
    </View>
  );
}
