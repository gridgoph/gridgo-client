import { ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import type { OrderApprovalProof } from "@/lib/api";
import { approvalRecordView, approvalTime } from "@/lib/approvalProof";
import { downloadApprovalProof } from "@/lib/approvalProofDownload";

type Props = {
  orderId: string;
  proof: OrderApprovalProof;
  onOpen: () => void;
};

/**
 * The order screen's "Approval record" section: each record in one line, the
 * way into the full record, and the PDF. A compatibility record reads as no
 * approval, never as one.
 */
export function ApprovalRecordSummary({ orderId, proof, onOpen }: Props) {
  const colors = useThemeColors();
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  if (!proof.records.length) {
    return (
      <Text className="py-3 text-body text-text-secondary">
        {proof.requirement?.required
          ? "GRIDGO is waiting for your approval of this order."
          : "No approval has been recorded for this order."}
      </Text>
    );
  }

  const download = async () => {
    setSaving(true);
    const result = await downloadApprovalProof(orderId);
    setNote(result.message ? { ok: result.ok, text: result.message } : null);
    setSaving(false);
  };

  return (
    <View className="gap-3 pt-1">
      {proof.records.map((record) => {
        const view = approvalRecordView(record);
        return (
          <View key={record.id} className="gap-1">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">{view.title}</Text>
              <StatusChip
                tone={view.approved ? "success" : "neutral"}
                icon={view.approved ? "circle-check" : "triangle-alert"}
                label={view.statusLabel}
              />
            </View>
            <Text className="text-caption text-text-muted">
              {view.methodLabel ? `${view.methodLabel} · ` : ""}
              {approvalTime(record.at)}
            </Text>
          </View>
        );
      })}

      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="View the approval record"
        className="gg-touch flex-row items-center gap-3 py-2"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View className="min-w-0 flex-1">
          <Text className="text-body font-medium text-text-primary">View the approval record</Text>
          <Text className="text-caption text-text-muted">What you approved, with your signature or tap.</Text>
        </View>
        <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
      </Pressable>

      <Pressable
        onPress={() => void download()}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel="Download the approval record as a PDF"
        accessibilityState={{ disabled: saving }}
        className={saving ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
        style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
      >
        <Text className="text-button text-text-primary">{saving ? "Preparing the PDF…" : "Download PDF"}</Text>
      </Pressable>
      {note ? (
        <Text className={note.ok ? "text-caption text-text-secondary" : "text-caption text-error"} accessibilityLiveRegion="polite">
          {note.text}
        </Text>
      ) : null}
    </View>
  );
}
