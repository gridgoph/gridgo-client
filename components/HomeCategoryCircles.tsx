import { Pressable, Text, View } from "react-native";

import { CATEGORY_ICONS } from "@/components/HomeCategoryRow";
import { useThemeColors } from "@/hooks/useTheme";
import { categoryCircleName, categoryGlyph } from "@/lib/categoryLook";
import type { ProductCategory } from "@/lib/productCategories";

type Props = {
  categories: ProductCategory[];
  onPress: (category: ProductCategory) => void;
};

/** The round button's edge: comfortably over the 44pt touch floor. */
export const CATEGORY_CIRCLE = 56;

/**
 * The product families as one row of round buttons (client#335).
 *
 * Five tall rows used to fill half of Home; one row keeps the whole start
 * menu on the first screen with Featured Prints and the tiles. Each button
 * is the family's mark and one word — the catalogue name is still what a
 * screen reader hears, and still the heading on the family's own screen.
 */
export function HomeCategoryCircles({ categories, onPress }: Props) {
  const colors = useThemeColors();
  return (
    <View className="flex-row justify-between">
      {categories.slice(0, 5).map((category) => {
        const Icon = CATEGORY_ICONS[categoryGlyph(category)];
        return (
          <Pressable
            key={category.code}
            onPress={() => onPress(category)}
            accessibilityRole="button"
            accessibilityLabel={category.name}
            className="flex-1 items-center gap-1.5"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          >
            <View
              className="items-center justify-center rounded-pill border border-outline bg-surface"
              style={{ width: CATEGORY_CIRCLE, height: CATEGORY_CIRCLE }}
            >
              <Icon size={22} color={colors.textPrimary} strokeWidth={1.75} />
            </View>
            <Text className="text-caption font-medium text-text-primary" numberOfLines={1}>
              {categoryCircleName(category)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
