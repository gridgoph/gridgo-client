import { Sun } from "lucide-react-native";
import { useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";

import { ClaimSlip } from "@/components/ClaimSlip";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { HandoverNotice as Notice } from "@/components/HandoverNotice";
import { HubPickupPanel } from "@/components/HubPickupPanel";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order, OrderHandover } from "@/lib/api";
import {
  HUB_BRIGHTNESS,
  HUB_KEEP_PRIVATE,
  HUB_MISMATCH,
  HUB_SHOW_BOTH,
  REDELIVERY_CONFIRM,
  redeliveryOffered,
  unclaimedNotice,
} from "@/lib/handover";
import { balanceDue } from "@/lib/payment";
import { actionFor, useHandoverActions } from "@/store/handoverActions";

/**
 * A hub pick-up that is on the shelf (gridgo-api#124): the QR and its
 * matching code, large enough to show across a counter, then the hub's days
 * and hours, then — only once days have been missed — the reminder and the
 * way out.
 *
 * The slip is the card's one bold thing. Everything else is quiet text,
 * because the client's whole job here is to hold the phone up. It carries no
 * yellow: there is nothing to press to collect, and a redelivery is an
 * alternative, not the next step.
 */
export function HubClaimCard({
  order,
  handover,
  onChanged,
}: {
  order: Order;
  handover: OrderHandover & { qrToken: string };
  /** Re-read the order and its handover after a request lands. */
  onChanged: () => void;
}) {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const owes = balanceDue(order);
  const notice = unclaimedNotice(handover);
  const redelivery = actionFor(useHandoverActions((state) => state.redelivery), order.id);
  const requestRedelivery = useHandoverActions((state) => state.requestRedelivery);
  const [confirming, setConfirming] = useState(false);
  // Page padding, card padding and the slip's own inset, so the QR is as
  // large as the phone allows without crowding the slip's edge.
  const qrSize = Math.max(176, Math.min(224, width - 104));

  const confirm = async () => {
    const sent = await requestRedelivery(order.id);
    setConfirming(false);
    if (sent) onChanged();
  };

  return (
    <View className="gg-card-flush">
      <View className="gap-5 p-4">
        <View className="gap-2">
          <Text className="text-overline text-text-muted">
            {owes ? "HELD AT GRIDGO OFFICE" : "READY AT GRIDGO OFFICE"}
          </Text>
          <Text accessibilityRole="header" className="text-h3 text-text-primary">
            Show both to the hub staff
          </Text>
        </View>

        {/* The slip leads, so the QR and its code fit on one screen together. */}
        <View className="gap-2">
          <ClaimSlip otp={handover.otp} qrToken={handover.qrToken} qrSize={qrSize} codeLabel="Matching code" />
          <View className="flex-row items-start gap-2">
            <Sun size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
            <Text className="min-w-0 flex-1 text-caption text-text-muted">{HUB_BRIGHTNESS}</Text>
          </View>
        </View>

        {owes ? (
          <Notice
            tone="warning"
            title="Pay the balance before you travel"
            body="The hub releases your order once Operations confirms your remaining payment."
          />
        ) : null}

        {notice ? <Notice tone={notice.tone} title={notice.title} body={notice.body} /> : null}

        {redeliveryOffered(handover) ? (
          <View className="gap-2">
            <SecondaryButton
              label={redelivery.busy ? "Sending…" : "Ask for redelivery"}
              disabled={redelivery.busy}
              onPress={() => setConfirming(true)}
            />
            {redelivery.error ? (
              <Text accessibilityRole="alert" className="text-caption text-error">
                {redelivery.error}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View className="gap-2">
          <Text className="text-body text-text-secondary">{HUB_SHOW_BOTH}</Text>
          <Text className="text-body text-text-secondary">{HUB_KEEP_PRIVATE}</Text>
          <Text className="text-body text-text-secondary">{HUB_MISMATCH}</Text>
        </View>

        <View className="gap-2">
          <Text className="text-body-lg font-medium text-text-primary">Hub days and hours</Text>
          <HubPickupPanel hub={{ point: handover.hub?.point, schedule: handover.hub?.schedule ?? null, feeMinor: 0 }} showFee={false} />
        </View>
      </View>

      <ConfirmDialog
        visible={confirming}
        question={REDELIVERY_CONFIRM.question}
        body={REDELIVERY_CONFIRM.body}
        confirmLabel={redelivery.busy ? "Sending…" : REDELIVERY_CONFIRM.confirmLabel}
        cancelLabel="Not now"
        busy={redelivery.busy}
        onConfirm={() => void confirm()}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}
