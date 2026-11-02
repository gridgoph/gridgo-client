import { Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import type { Order } from "@/lib/api";
import { orderSampleAction, orderSampleLine, orderSampleLink } from "@/lib/sampleFirst";

/**
 * A sample order, or a batch made from one, says so and links its other half
 * (gridgo-api#222). Monochrome: the order's one yellow belongs to its action
 * zone, and this is a way to somewhere else, not the thing to do here.
 */
export function SampleLinkCard({
  order,
  onOpenOrder,
  onOpenSample,
}: {
  order: Order;
  onOpenOrder: (orderId: string) => void;
  onOpenSample: (draftId: string) => void;
}) {
  const link = orderSampleLink(order);
  if (!link) return null;
  const action = orderSampleAction(link, order);
  return (
    <View className="gg-card gap-3" testID="sample-link-card">
      <View className="flex-row">
        <View className="gg-chip">
          <Text className="text-caption font-medium text-text-primary">{link.tag}</Text>
        </View>
      </View>
      <Text className="text-body text-text-secondary">{orderSampleLine(link, order)}</Text>
      {action && link.draftId ? (
        <SecondaryButton label={action} onPress={() => onOpenSample(link.draftId!)} />
      ) : null}
      {link.linkedOrderId && link.linkLabel ? (
        <SecondaryButton label={link.linkLabel} onPress={() => onOpenOrder(link.linkedOrderId!)} />
      ) : null}
    </View>
  );
}
