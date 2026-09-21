import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { formatPhp } from "@/lib/api";
import {
  SERVICE_FEE_EXPLAINER,
  serviceFeeLabel,
} from "@/lib/serviceFee";

type Props = {
  amountMinor: number | null;
  rateBps: number | null;
  /** Shown when the amount is not known yet. */
  pendingLabel?: string;
};

/**
 * Printing + delivery's missing third line.
 *
 * The amount is the row. Tapping it is how a client asks what the fee is
 * for — the explainer is not a second yellow control, and it is not on
 * screen until they ask.
 */
export function ServiceFeeRow({ amountMinor, rateBps, pendingLabel = "—" }: Props) {
  const [open, setOpen] = useState(false);
  const label = serviceFeeLabel(rateBps);
  const value = amountMinor == null ? pendingLabel : formatPhp(amountMinor);

  return (
    <View className="border-b border-outline-subtle">
      <Pressable
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        accessibilityHint="What the service fee is for"
        className="flex-row items-baseline justify-between gap-4 py-3"
      >
        <Text className="text-body text-text-secondary">{label}</Text>
        <Text className="shrink text-body text-text-primary">{value}</Text>
      </Pressable>
      {open ? (
        <Text className="pb-3 text-caption text-text-muted">{SERVICE_FEE_EXPLAINER}</Text>
      ) : null}
    </View>
  );
}
