import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { formatPhp } from "@/lib/api";
import {
  SERVICE_FEE_EXPLAINER,
  serviceFeeLabel,
} from "@/lib/serviceFee";

type Props = {
  amountMinor?: number | null;
  rateBps: number | null;
  /** Shown when the amount is not known yet. */
  pendingLabel?: string;
  /**
   * Tap-to-explain only. Printing already includes the fee, so this row
   * must not show a peso amount that looks like a second charge.
   */
  explainOnly?: boolean;
};

/**
 * Printing + delivery's missing third line — or, on client checkout and
 * receipt, an explainer for a fee that is already inside Printing.
 *
 * The amount is the row when this is a charged split. Tapping it is how a
 * client asks what the fee is for — the explainer is not a second yellow
 * control, and it is not on screen until they ask.
 */
export function ServiceFeeRow({
  amountMinor,
  rateBps,
  pendingLabel = "—",
  explainOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const label = serviceFeeLabel(rateBps);
  const value = explainOnly
    ? null
    : amountMinor == null
      ? pendingLabel
      : formatPhp(amountMinor);
  const moreLabel = open ? "View less" : "View more";

  return (
    <View className="border-b border-outline-subtle">
      <Pressable
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={explainOnly ? `${label}. ${moreLabel}` : label}
        accessibilityHint="What the service fee is for"
        className="flex-row items-baseline justify-between gap-4 py-3"
      >
        <Text className="text-body text-text-secondary">{label}</Text>
        {value != null ? (
          <Text className="shrink text-body text-text-primary">{value}</Text>
        ) : explainOnly ? (
          <Text className="shrink text-button text-text-primary">{moreLabel}</Text>
        ) : null}
      </Pressable>
      {open ? (
        <Text className="pb-3 text-caption text-text-muted">{SERVICE_FEE_EXPLAINER}</Text>
      ) : null}
    </View>
  );
}
