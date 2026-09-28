import { Text, View } from "react-native";

import { ServiceFeeRow } from "@/components/ServiceFeeRow";
import { SpecRow } from "@/components/SpecRow";
import { formatPhp, type Order, type RefundSettlement } from "@/lib/api";
import { refundBreakdown } from "@/lib/refunds";
import { serviceFeeVisibleToClient } from "@/lib/serviceFee";
import { usePlatformSettings } from "@/store/platformSettings";

/**
 * What comes back, in the order's own money shape: Printing (the returned
 * service fee already inside it), Delivery, Total — Printing + Delivery =
 * Total. The service-fee row explains and carries no amount, exactly as on
 * checkout and the receipt; GRIDGO's cut never appears in pesos.
 */
export function RefundBreakdownCard({ settlement, order }: { settlement: RefundSettlement; order: Order }) {
  const settings = usePlatformSettings((state) => state.settings);
  const breakdown = refundBreakdown(settlement, order);
  const delivered = order.fulfillmentMode !== "pickup";

  return (
    <View className="gap-3">
      <Text className="text-body text-text-secondary">{breakdown.scope}</Text>
      <View className="gg-card">
        <SpecRow label="Printing" value={formatPhp(breakdown.printingMinor)} />
        {delivered ? <SpecRow label="Delivery" value={formatPhp(breakdown.deliveryMinor)} /> : null}
        {breakdown.includesFee && serviceFeeVisibleToClient(settings) ? (
          <ServiceFeeRow explainOnly rateBps={order.serviceFeeRateBps ?? null} />
        ) : null}
        <View className="flex-row items-baseline justify-between gap-4 pt-3">
          <Text className="text-body-lg text-text-secondary">Refund total</Text>
          <Text className="text-h3 text-text-primary">{formatPhp(breakdown.totalMinor)}</Text>
        </View>
      </View>
      {breakdown.kept ? <Text className="text-caption text-text-muted">{breakdown.kept}</Text> : null}
    </View>
  );
}
