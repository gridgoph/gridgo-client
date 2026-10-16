import { Text, View } from "react-native";

import type { ColourCorrection as Correction, ColourPage, ColourPricing, ProductionItem } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import {
  a3LimitOf,
  coverageText,
  pageFileOrder,
  pageName,
  pageSheetPrice,
  tierLabel,
} from "@/lib/colourPricing";

/**
 * A shop's colour correction, page by page (gridgo-api
 * `docs/COLOUR_PRICING_API.md`): GRIDGO's colour reading is an estimate, and a
 * shop that finds a page in a different colour level asks the client to
 * approve the new price rather than printing at it. Each page shows the
 * shop's reading and price, with what the client agreed to under it when the
 * two differ; then the item's printing before and after. Every amount is
 * GRIDGO's all-in figure, as on the receipt.
 */
export function ColourCorrectionDetail({
  correction,
  item,
}: {
  correction: Correction;
  /** The item as it stands: its last agreed correction, else its checkout reading. */
  item: Pick<ProductionItem, "colourPricing" | "agreedColourCorrection"> | null;
}) {
  const before: Pick<ColourPricing, "pages"> | null = item?.agreedColourCorrection ?? item?.colourPricing ?? null;
  const fileOrder = pageFileOrder(correction.pages);
  const a3 = a3LimitOf(item?.colourPricing);
  const was = (page: ColourPage) =>
    before?.pages.find((entry) => entry.fileId === page.fileId && entry.page === page.page) ?? null;
  const from = correction.originalClientLineSubtotalMinor;
  const to = correction.correctedClientLineSubtotalMinor;

  return (
    <View className="gap-3" testID="colour-correction">
      <View className="gg-card-flush">
        {correction.pages.map((page, index) => {
          const old = was(page);
          const price = pageSheetPrice(page);
          const oldPrice = old ? pageSheetPrice(old) : null;
          const changed = old && (old.strongColourBps !== page.strongColourBps || oldPrice !== price);
          const level = tierLabel(page.tier, a3);
          const label = `${pageName(page, fileOrder)}: ${coverageText(page.strongColourBps)} strong colour${price != null ? `, ${formatPhp(price)} a sheet` : ""}.${
            changed ? ` Was ${coverageText(old.strongColourBps)}${oldPrice != null ? `, ${formatPhp(oldPrice)}` : ""}.` : " Unchanged."
          }`;
          return (
            <View
              key={`${page.fileId}:${page.page}`}
              className={index ? "gap-1 border-t border-outline-subtle px-4 py-3" : "gap-1 px-4 py-3"}
              accessible
              accessibilityLabel={label}
            >
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="min-w-0 flex-1 text-body text-text-primary">
                  <Text className="font-medium">{pageName(page, fileOrder)}</Text>
                  {`  ${coverageText(page.strongColourBps)} strong colour`}
                </Text>
                {price != null ? (
                  <Text className="shrink-0 text-body-lg font-medium text-text-primary">{formatPhp(price)}</Text>
                ) : null}
              </View>
              {level ? <Text className="text-caption text-text-muted">{level}</Text> : null}
              {changed ? (
                <Text className="text-caption text-text-secondary">
                  Was {coverageText(old.strongColourBps)} strong colour{oldPrice != null ? `, ${formatPhp(oldPrice)}` : ""}
                </Text>
              ) : (
                <Text className="text-caption text-text-muted">Unchanged</Text>
              )}
            </View>
          );
        })}
      </View>
      {from != null && to != null ? (
        <View
          className="gap-1"
          accessible
          accessibilityLabel={`Printing for this item: ${formatPhp(from)} before, ${formatPhp(to)} with the correction`}
        >
          <View className="flex-row flex-wrap items-baseline justify-between gap-x-4">
            <Text className="text-body text-text-secondary">Printing, as you ordered it</Text>
            <Text className="text-body text-text-secondary">{formatPhp(from)}</Text>
          </View>
          <View className="flex-row flex-wrap items-baseline justify-between gap-x-4">
            <Text className="text-body font-medium text-text-primary">Printing, corrected</Text>
            <Text className="text-body-lg font-medium text-text-primary">{formatPhp(to)}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
