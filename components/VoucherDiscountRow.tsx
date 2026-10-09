import { Text, View } from "react-native";

import { formatPhp } from "@/lib/api";
import { VOUCHER_LABEL, voucherAmount, voucherDiscountOf } from "@/lib/vouchers";

/**
 * "Voucher −₱15.00", wherever a client reads what an order costs.
 *
 * GRIDGO sends the discount already out of the total, so this row explains a
 * total rather than changing it: Printing + Delivery − Voucher = Total. It
 * names no fee and no split between fee and delivery — only what came off.
 */
export function VoucherDiscountRow({
  source,
  label = VOUCHER_LABEL,
  divider = true,
}: {
  source: { voucherDiscountMinor?: number | null } | null | undefined;
  label?: string;
  divider?: boolean;
}) {
  const minor = voucherDiscountOf(source);
  if (!minor) return null;
  return (
    <View
      className={`flex-row items-baseline justify-between gap-4 py-3 ${divider ? "border-b border-outline-subtle" : ""}`}
      accessible
      accessibilityLabel={`${label}, minus ${formatPhp(minor)}`}
      testID="voucher-discount-row"
    >
      <Text className="shrink-0 text-body text-text-secondary">{label}</Text>
      <Text className="shrink text-right text-body font-medium text-success">{voucherAmount(minor)}</Text>
    </View>
  );
}
