import { Text, View } from "react-native";

import { RefundStageRail } from "@/components/refund/RefundStageRail";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import type { Refund } from "@/lib/api";
import { refundEntryNote, refundHeadline, refundStatusMeta, type RefundEntry } from "@/lib/refunds";

/**
 * Where this order's refund stands, on the order itself.
 *
 * Monochrome and one button: the refund screen owns the detail, and while a
 * request is open the job has nothing else to ask of the client, so this is
 * the order's whole action zone.
 */
export function RefundOrderCard({ refund, onOpen }: { refund: Refund; onOpen: () => void }) {
  const meta = refundStatusMeta(refund.status);
  const { headline, detail } = refundHeadline(refund);
  return (
    <View className="gg-card gap-4">
      <View className="gap-2">
        <View className="flex-row">
          <StatusChip tone={meta.tone} label={meta.label} icon={meta.icon} />
        </View>
        <Text className="text-h3 text-text-primary">{headline}</Text>
        <Text className="text-body text-text-secondary">{detail}</Text>
      </View>
      <RefundStageRail status={refund.status} />
      <SecondaryButton label="View refund" onPress={onOpen} />
    </View>
  );
}

/**
 * "Request a refund", only when the platform would take one, with the time
 * limit said up front rather than discovered in a refusal.
 */
export function RefundEntryRow({
  entry,
  onRequest,
}: {
  entry: Extract<RefundEntry, { kind: "eligible" }>;
  onRequest: () => void;
}) {
  return (
    <View className="gg-panel gap-3">
      <View className="gap-1">
        <Text className="text-body-lg font-medium text-text-primary">Need to cancel, or is something wrong?</Text>
        <Text className="text-caption text-text-muted">{refundEntryNote(entry)}</Text>
      </View>
      <SecondaryButton label="Request a refund" onPress={onRequest} />
    </View>
  );
}
