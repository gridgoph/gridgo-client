import { Pressable, Text, View } from "react-native";

import type { ProductCategory } from "@/lib/productCategories";

type Props = {
  category: ProductCategory;
  onPress: () => void;
};

/**
 * One family GRIDGO prints, as a start tile.
 *
 * Home's second question is how to start something new. The yellow "+" already
 * owns the primary start, so these stay ink, and they jump into a category
 * rather than opening the full picker — that picker is one tap further, on
 * the plus and on the empty state's action.
 */
export function HomeCategoryTile({ category, onPress }: Props) {
  const caption = category.subcategories
    .slice(0, 3)
    .map((entry) => entry.name)
    .join(" · ");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={category.name}
      accessibilityHint={`Best for ${category.bestFor}`}
      className="gg-card gg-touch"
    >
      {({ pressed }) => (
        <>
          <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
            {category.name}
          </Text>
          {caption ? (
            <Text className="mt-1 text-caption text-text-muted" numberOfLines={1}>
              {caption}
            </Text>
          ) : null}
          {pressed ? (
            <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-card" />
          ) : null}
        </>
      )}
    </Pressable>
  );
}
