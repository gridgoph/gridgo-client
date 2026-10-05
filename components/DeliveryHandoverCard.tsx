import { ShieldAlert } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ClaimSlip } from "@/components/ClaimSlip";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { HandoverNotice } from "@/components/HandoverNotice";
import { useThemeColors } from "@/hooks/useTheme";
import type { OrderHandover } from "@/lib/api";
import { DELIVERY_MATCH, DELIVERY_MISMATCH } from "@/lib/handover";
import { actionFor, useHandoverActions } from "@/store/handoverActions";

/**
 * The door's half of the handover (gridgo-api#125): the six-digit code the
 * rider also sees, shown large enough to compare at arm's length.
 *
 * The client never controls the delivery, so there is nothing to press to
 * accept it. What the card owes them is the rule — match, then accept — and
 * what to do when the codes differ: refuse, and let the rider take it to
 * Operations. Telling Operations themselves is there too, but quiet: it is a
 * report, never an override, and the rider reports it as well.
 */
export function DeliveryHandoverCard({ orderId, handover }: { orderId: string; handover: OrderHandover }) {
  const colors = useThemeColors();
  const report = actionFor(useHandoverActions((state) => state.escalation), orderId);
  const reportMismatch = useHandoverActions((state) => state.reportMismatch);
  const [confirming, setConfirming] = useState(false);

  const send = async () => {
    await reportMismatch(orderId);
    setConfirming(false);
  };

  return (
    <View className="gg-card gap-5">
      <View className="gap-2">
        <Text className="text-overline text-text-muted">WHEN YOUR RIDER ARRIVES</Text>
        <Text accessibilityRole="header" className="text-h3 text-text-primary">
          Match this code with your rider
        </Text>
        <Text className="text-body text-text-secondary">{DELIVERY_MATCH}</Text>
      </View>

      <ClaimSlip otp={handover.otp} codeLabel="Handover code" />

      <HandoverNotice tone="warning" title={DELIVERY_MISMATCH.title} body={DELIVERY_MISMATCH.body} />

      {report.done ? (
        <Text accessibilityRole="alert" className="text-body text-text-secondary">
          Operations has your report. Keep the order with the rider until they contact you.
        </Text>
      ) : (
        <View className="gap-1">
          <Pressable
            onPress={() => setConfirming(true)}
            disabled={report.busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: report.busy }}
            className="gg-touch flex-row items-center gap-2 self-start"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          >
            <ShieldAlert size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            <Text className="text-button text-text-primary">
              {report.busy ? "Sending…" : "Tell Operations the codes do not match"}
            </Text>
          </Pressable>
          {report.error ? (
            <Text accessibilityRole="alert" className="text-caption text-error">
              {report.error}
            </Text>
          ) : null}
        </View>
      )}

      <ConfirmDialog
        visible={confirming}
        question="Tell Operations the codes do not match?"
        body="Do not accept the order. GRIDGO Operations is alerted straight away and contacts you and the rider."
        confirmLabel={report.busy ? "Sending…" : "Tell Operations"}
        cancelLabel="Not now"
        busy={report.busy}
        onConfirm={() => void send()}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}
