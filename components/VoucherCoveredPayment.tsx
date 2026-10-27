import { TicketCheck } from "lucide-react-native";
import { Text, View } from "react-native";

import { SpecRow } from "@/components/SpecRow";
import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp } from "@/lib/api";
import { FULL_PAYMENT_PERCENT } from "@/lib/payment";
import { voucherCoveredLine } from "@/lib/vouchers";

/**
 * "How you pay" when a whole-order launch voucher leaves nothing to send now.
 *
 * GRIDGO settles the first payment with the voucher as the order is placed,
 * so there is no QR, no screenshot and no reference to ask for. A legacy
 * split order still owes its balance before delivery, and says so.
 */
export function VoucherCoveredPayment({
  voucherName,
  downpaymentPercent,
  balanceMinor,
}: {
  voucherName: string;
  downpaymentPercent: number;
  balanceMinor: number | null;
}) {
  const colors = useThemeColors();
  const owesLater = balanceMinor != null && balanceMinor > 0;
  return (
    <View className="gap-3" testID="voucher-covered-payment">
      <View className="gg-panel-high flex-row items-start gap-3" accessible accessibilityRole="text">
        <View className="pt-0.5">
          <TicketCheck size={20} color={colors.success} strokeWidth={2} aria-hidden />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body-lg font-medium text-text-primary">Nothing to pay now</Text>
          <Text className="text-body text-text-secondary">{voucherCoveredLine(voucherName, owesLater)}</Text>
        </View>
      </View>
      {owesLater ? (
        <View className="gg-card gap-1">
          <SpecRow label={`Now (${downpaymentPercent}%)`} value={formatPhp(0)} />
          <SpecRow
            label={`Before delivery (${FULL_PAYMENT_PERCENT - downpaymentPercent}%)`}
            value={formatPhp(balanceMinor)}
          />
        </View>
      ) : null}
    </View>
  );
}
