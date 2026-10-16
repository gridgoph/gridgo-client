import { Text, View } from "react-native";

import { ColourPageList } from "@/components/ColourPricingSection";
import type { ProductionItem } from "@/lib/api";
import { a3LimitOf, oneColourWarning } from "@/lib/colourPricing";
import { formatTimelineStamp } from "@/lib/relativeTime";

/**
 * The colour GRIDGO measured on each page when the order was placed, saved
 * with the order as the record of how it was priced (gridgo-api
 * `docs/COLOUR_PRICING_API.md`). A correction the client approved is drawn
 * in its place, and the original stays on GRIDGO's record either way.
 */
export function ColourEvidence({ item }: { item: Pick<ProductionItem, "colourPricing" | "agreedColourCorrection"> }) {
  const original = item.colourPricing ?? null;
  const agreed = item.agreedColourCorrection ?? null;
  const pages = agreed?.pages ?? original?.pages ?? [];
  if (!pages.length) return null;
  const priced = original?.pricedByColour ?? Boolean(agreed);
  const warning = agreed ? null : oneColourWarning(original);
  return (
    <View className="gap-2 border-b border-outline-subtle py-3" testID="colour-evidence">
      <Text className="text-body text-text-secondary">
        {agreed ? "Colour on each page, as corrected" : "Colour on each page"}
      </Text>
      {warning ? <Text className="text-caption text-warning">{warning}</Text> : null}
      <ColourPageList
        pages={pages}
        showPrice={priced}
        tierSet={original?.tierSet}
        a3MonochromeMaxBps={a3LimitOf(original)}
      />
      <Text className="text-caption text-text-muted">
        {agreed
          ? `You approved the shop's correction${agreed.appliedAt ? ` on ${formatTimelineStamp(agreed.appliedAt)}` : ""}. GRIDGO keeps the colour it measured when you ordered on record too.`
          : priced
            ? "Measured when you placed the order and saved with it. Each page was priced from this."
            : "Measured when you placed the order and saved with it."}
      </Text>
    </View>
  );
}
