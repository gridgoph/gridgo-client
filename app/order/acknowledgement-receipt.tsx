import { useCallback, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Info } from "lucide-react-native";

import { ErrorState } from "@/components/ErrorState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonLine, SkeletonList } from "@/components/Skeleton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import {
  ACK_RECEIPT_TITLE,
  downloadAcknowledgementReceipt,
  issuedStamp,
  lineDetail,
  NOT_OFFICIAL_RECEIPT,
  paymentHeading,
  paymentRows,
  receiptAbsence,
  receiptAdjustments,
  receiptReadError,
  receiptStage,
} from "@/lib/acknowledgementReceipt";
import { groupTag } from "@/lib/basketGroups";
import { orderReference } from "@/lib/orderReference";

type Read =
  | { kind: "loading" }
  | { kind: "issued"; receipt: api.AcknowledgementReceipt; order: api.Order | null }
  | { kind: "absent"; order: api.Order }
  | { kind: "error"; error: unknown };

/**
 * The delivery acknowledgement receipt (gridgo-rider#152): what GRIDGO
 * delivered to the client's door and what they paid at checkout, numbered in
 * GRIDGO's one AR series. The rider's paper copy is the one both sides sign;
 * this is the client's own copy, with a PDF to keep. It is never an official
 * receipt, and GRIDGO's note saying so is always drawn as sent.
 */
export default function AcknowledgementReceiptScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const [read, setRead] = useState<Read>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    if (!orderId) return;
    const at = ++sequence.current;
    try {
      // The order says why a receipt is missing and which shop group this is.
      // A failed order read costs only that, never a receipt GRIDGO sent.
      const [receipt, order] = await Promise.all([
        api.getAcknowledgementReceipt(orderId),
        api.getOrder(orderId).catch((error: unknown) => error),
      ]);
      if (at !== sequence.current) return;
      const current = order instanceof Error || !order ? null : (order as api.Order);
      if (receipt) setRead({ kind: "issued", receipt, order: current });
      else if (current) setRead({ kind: "absent", order: current });
      else setRead({ kind: "error", error: order });
    } catch (error) {
      if (at !== sequence.current) return;
      setRead({ kind: "error", error });
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        sequence.current++;
      };
    }, [load]),
  );
  // Issued at the door: GRIDGO's order and inbox events land it here unasked.
  useLiveRefresh(["orders", "notifications"], load, { refreshOnFocus: false });

  const openOrder = () => {
    if (!orderId) return;
    router.push({ pathname: "/order/[id]", params: { id: orderId } });
  };
  const openSummary = () => {
    if (!orderId) return;
    router.push({ pathname: "/order/receipt", params: { orderId } });
  };

  if (read.kind === "loading") {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page gap-4 pt-4">
          <SkeletonLine width="w-3/5" height="h-7" />
          <SkeletonLine width="w-4/5" />
          <SkeletonList count={3} />
        </View>
      </Screen>
    );
  }

  if (read.kind === "error") {
    const failure = receiptReadError(read.error);
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page gap-3 pt-4">
          <ErrorState label={failure.title} body={failure.body} onRetry={() => void load()} />
          {orderId ? <SecondaryButton label="View this order" onPress={openOrder} /> : null}
        </View>
      </Screen>
    );
  }

  if (read.kind === "absent") {
    const absence = receiptAbsence(read.order);
    const stage = receiptStage(read.order);
    const waiting = stage === "at_door" || stage === "before_door";
    return (
      <Screen edges={["bottom"]}>
        <ScrollView className="gg-screen" contentContainerClassName="gg-page gap-4 pb-8 pt-4">
          <Text className="text-h2 text-text-primary" accessibilityRole="header">
            {ACK_RECEIPT_TITLE}
          </Text>
          <View className="gg-card gap-3">
            <StatusChip
              tone={waiting ? "info" : "neutral"}
              icon={waiting ? "clock" : "circle-x"}
              label={absence.title}
            />
            <Text className="text-body text-text-primary">{absence.body}</Text>
          </View>
          {stage === "pickup" || stage === "delivered" ? (
            <SecondaryButton label="View order receipt" onPress={openSummary} />
          ) : null}
          <SecondaryButton label="View this order" onPress={openOrder} />
        </ScrollView>
      </Screen>
    );
  }

  const { receipt, order } = read;
  const group = order ? groupTag(order) : null;

  const download = async () => {
    setSaving(true);
    const result = await downloadAcknowledgementReceipt(receipt);
    setNote(result.message ? { ok: result.ok, text: result.message } : null);
    setSaving(false);
  };

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen" contentContainerClassName="gg-page gap-6 pb-8 pt-4">
        <View className="gap-2">
          {group ? <Text className="text-overline text-text-muted">{group.toUpperCase()}</Text> : null}
          <Text className="text-h2 text-text-primary" accessibilityRole="header">
            {ACK_RECEIPT_TITLE}
          </Text>
          <Text className="text-body text-text-secondary">
            {NOT_OFFICIAL_RECEIPT} It lists what is on this delivery and what you paid at checkout.
            The paper copy from your rider is the one you both sign.
          </Text>
        </View>

        <View className="gg-card" testID="ack-receipt-facts">
          <SpecRow label="AR number" value={receipt.arNumber} />
          <SpecRow label="Order number" value={orderReference(receipt.orderNumber) ?? receipt.orderNumber} />
          <SpecRow label="Date issued" value={issuedStamp(receipt.issuedAt)} />
          <SpecRow label="Issued to" value={receipt.issuedTo} />
        </View>

        <View className="gap-3">
          <Text className="text-overline text-text-muted">ON THIS DELIVERY</Text>
          <View className="gg-card">
            {receipt.lines.map((line) => (
              <View
                key={line.id}
                className="gap-0.5 border-b border-outline-subtle py-3"
                accessible
                accessibilityLabel={`${line.description}. ${lineDetail(line)}. Subtotal ${formatPhp(line.subtotalMinor)}.`}
              >
                <View className="flex-row items-baseline justify-between gap-4">
                  <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">{line.description}</Text>
                  <Text className="text-body text-text-primary">{formatPhp(line.subtotalMinor)}</Text>
                </View>
                <Text className="text-caption text-text-muted">{lineDetail(line)}</Text>
              </View>
            ))}
            {receiptAdjustments(receipt).map((row) => (
              <SpecRow key={row.label} label={row.label} value={row.value} />
            ))}
            <View className="flex-row flex-wrap items-baseline justify-between gap-x-4 pt-3">
              <Text className="text-body-lg text-text-secondary">Grand total</Text>
              <Text className="text-h3 text-text-primary">{formatPhp(receipt.grandTotalMinor)}</Text>
            </View>
          </View>
        </View>

        {receipt.payments.length ? (
          <View className="gap-3">
            <Text className="text-overline text-text-muted">PAYMENT AS RECORDED</Text>
            <View className="gg-card">
              {receipt.payments.map((payment, index) => (
                <View key={payment.code} className={index > 0 ? "pt-3" : undefined}>
                  {receipt.payments.length > 1 ? (
                    <Text className="pt-1 text-body font-medium text-text-primary">
                      {paymentHeading(index, receipt.payments.length)}
                    </Text>
                  ) : null}
                  {paymentRows(payment).map((row) => (
                    <SpecRow key={row.label} label={row.label} value={row.value} />
                  ))}
                </View>
              ))}
              <Text className="pt-3 text-caption text-text-muted">
                Paid at checkout. There is nothing to pay the rider.
              </Text>
            </View>
          </View>
        ) : null}

        {group ? (
          <Text className="text-caption text-text-secondary">
            Each part of a multi-shop order has its own acknowledgement receipt and number. This one
            covers {order?.groupLabel ?? "this part"} only. Switch parts on the order to see the others.
          </Text>
        ) : null}

        <ReceiptNote text={receipt.note} />
      </ScrollView>

      <View className="gap-2 border-t border-outline bg-surface px-4 pb-2 pt-3">
        <PrimaryButton
          label={saving ? "Preparing the PDF…" : "Download receipt (PDF)"}
          disabled={saving}
          onPress={() => void download()}
        />
        {note ? (
          <Text
            className={note.ok ? "text-center text-caption text-text-secondary" : "text-center text-caption text-error"}
            accessibilityLiveRegion="polite"
          >
            {note.text}
          </Text>
        ) : (
          <Text className="text-center text-caption text-text-muted">
            The PDF carries the same figures, with blank lines for the paper signatures.
          </Text>
        )}
      </View>
    </Screen>
  );
}

/** GRIDGO's own words on what this receipt is, exactly as sent. */
function ReceiptNote({ text }: { text: string }) {
  const colors = useThemeColors();
  return (
    <View className="gg-card flex-row gap-3" accessible accessibilityRole="text">
      <Info size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      <Text className="min-w-0 flex-1 text-body text-text-secondary">{text}</Text>
    </View>
  );
}
