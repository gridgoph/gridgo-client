import { ChevronRight, ReceiptText } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import type { AcknowledgementReceipt, Order } from "@/lib/api";
import { ACK_RECEIPT_TITLE, receiptStage, receiptSummaryLine } from "@/lib/acknowledgementReceipt";

type Props = {
  order: Pick<Order, "fulfillmentMode" | "state">;
  /** Null when GRIDGO has issued none; `"error"` when the read failed. */
  receipt: AcknowledgementReceipt | null | "error";
  onOpen: () => void;
  onRetry: () => void;
};

/**
 * The order screen's way to the delivery acknowledgement receipt.
 *
 * Drawn once the receipt exists, and on a delivered order that has none — that
 * one was delivered before GRIDGO issued receipts, and the screen behind the
 * row says so. An order still on its way draws nothing until the rider
 * prepares it at the door. Never yellow: the order's one action lives above.
 */
export function AcknowledgementReceiptEntry({ order, receipt, onOpen, onRetry }: Props) {
  const colors = useThemeColors();

  if (receipt === "error") {
    return (
      <View className="gg-card gap-3">
        <Text className="text-body-lg font-medium text-text-primary">Your acknowledgement receipt did not load</Text>
        <Text className="text-body text-text-secondary">Check your connection and try again.</Text>
        <SecondaryButton label="Try again" onPress={onRetry} />
      </View>
    );
  }

  if (!receipt && receiptStage(order) !== "delivered") return null;

  const caption = receipt ? receiptSummaryLine(receipt) : "None — delivered before receipts began";

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${ACK_RECEIPT_TITLE}. ${caption}`}
      accessibilityHint={receipt ? "Opens the receipt and its PDF download" : "Explains why this order has none"}
      className="gg-card gg-touch flex-row items-center gap-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <ReceiptText size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{ACK_RECEIPT_TITLE}</Text>
        <Text className="text-caption text-text-muted">{caption}</Text>
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
    </Pressable>
  );
}
