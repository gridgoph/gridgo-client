import { Pressable, Text, View } from "react-native";

import { SamplePhoto } from "@/components/SamplePhoto";
import { formatPhp } from "@/lib/api";
import type { CatalogItem } from "@/lib/api";
import { readyInLine, samplePhotoUri, unitLine } from "@/lib/listing";
import type { ProductSubcategory } from "@/lib/productCategories";

type Props = {
  subcategory: ProductSubcategory;
  listing: CatalogItem | null;
  onPress: () => void;
};

function moneyLine(listing: CatalogItem | null): { amount: string; unit: string } | null {
  if (!listing) return null;
  return {
    amount: `From ${formatPhp(listing.fromPriceMinor)}`,
    unit: unitLine(listing),
  };
}

function sampleUrl(listing: CatalogItem | null): string | null {
  return listing ? samplePhotoUri(listing.photos[0]) : null;
}

/**
 * One thing GRIDGO can print, as a quote strip.
 *
 * Sample on the left, what it is in the middle, the peso amount and how it is
 * sold on the right — the same strip a shop scans on its own board, minus the
 * press's name. A client picking flyers is choosing the work, not the shop.
 */
export function CategorySampleRow({ subcategory, listing, onPress }: Props) {
  const money = moneyLine(listing);
  const ready = listing ? readyInLine(listing.turnaroundHours) : null;

  return (
    <View className="rounded-card border border-outline bg-surface">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          money
            ? `${subcategory.name}, ${money.amount} ${money.unit}`
            : subcategory.name
        }
        accessibilityHint="Finds GRIDGO's printer for this"
        className="flex-row items-start gap-3 py-1 pr-4"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View className="w-28 shrink-0">
          <SamplePhoto
            url={sampleUrl(listing)}
            altText={listing?.photos[0]?.altText ?? subcategory.name}
            emptyLabel="No sample"
            gutter="tight"
          />
        </View>
        <View className="min-w-0 flex-1 gap-1 py-3">
          <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
            {subcategory.name}
          </Text>
          {subcategory.examples ? (
            <Text className="text-caption text-text-muted" numberOfLines={2}>
              {subcategory.examples}
            </Text>
          ) : null}
          {ready ? (
            <Text className="text-caption text-text-muted" numberOfLines={1}>
              {ready}
            </Text>
          ) : null}
        </View>
        {money ? (
          <View className="max-w-[42%] shrink-0 items-end gap-0.5 py-3">
            <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
              {money.amount}
            </Text>
            <Text className="text-right text-caption text-text-secondary" numberOfLines={2}>
              {money.unit}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/**
 * One thing GRIDGO can print, as a sample tile.
 *
 * The photo leads because that is what a client picks with. Under it, the name
 * and the starting price — the two facts that decide a tap.
 */
export function CategorySampleCard({ subcategory, listing, onPress }: Props) {
  const money = moneyLine(listing);

  return (
    <View className="rounded-card border border-outline bg-surface">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          money
            ? `${subcategory.name}, ${money.amount} ${money.unit}`
            : subcategory.name
        }
        accessibilityHint="Finds GRIDGO's printer for this"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <SamplePhoto
          url={sampleUrl(listing)}
          altText={listing?.photos[0]?.altText ?? subcategory.name}
          emptyLabel="No sample"
        />
        <View className="gap-1 px-3 pb-3">
          <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
            {subcategory.name}
          </Text>
          {subcategory.examples ? (
            <Text className="text-caption text-text-muted" numberOfLines={1}>
              {subcategory.examples}
            </Text>
          ) : null}
          {money ? (
            <Text className="text-body text-text-primary" numberOfLines={1}>
              {money.amount} {money.unit}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}
