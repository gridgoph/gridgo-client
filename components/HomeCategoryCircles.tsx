import { Zap } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { CATEGORY_ICONS } from "@/components/HomeCategoryRow";
import { useThemeColors } from "@/hooks/useTheme";
import { categoryCircleName, categoryGlyph } from "@/lib/categoryLook";
import { canonicalCategoryCode, type ProductCategory } from "@/lib/productCategories";

type Props = {
  categories: ProductCategory[];
  onPress: (category: ProductCategory) => void;
  /** The Docs circle's ⚡ badge: Express documents (gridgo-client#441). */
  onExpress?: () => void;
};

/** The family whose circle carries the Express badge. */
export const EXPRESS_CATEGORY_CODE = "document_publication";
const BADGE = 22;

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
export function HomeCategoryCircles({ categories, onPress, onExpress }: Props) {
  const colors = useThemeColors();
  return (
    <View className="flex-row justify-between">
      {categories.slice(0, 5).map((category) => {
        const Icon = CATEGORY_ICONS[categoryGlyph(category)];
        const express = onExpress && canonicalCategoryCode(category.code) === EXPRESS_CATEGORY_CODE;
        return (
          <View key={category.code} className="flex-1 items-center">
            <Pressable
              onPress={() => onPress(category)}
              accessibilityRole="button"
              accessibilityLabel={category.name}
              className="w-full items-center gap-1.5"
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
            {express ? (
              // Its own button on the circle's shoulder: the circle still opens the family.
              <Pressable
                testID="express-badge"
                onPress={onExpress}
                accessibilityRole="button"
                accessibilityLabel="Express documents"
                hitSlop={12}
                className="absolute items-center justify-center rounded-pill bg-action-yellow"
                style={{
                  width: BADGE,
                  height: BADGE,
                  top: -4,
                  left: "50%",
                  marginLeft: CATEGORY_CIRCLE / 2 - BADGE / 2 - 2,
                  borderWidth: 2,
                  borderColor: colors.canvas,
                }}
              >
                <Zap size={12} color={colors.actionYellowOn} fill={colors.actionYellowOn} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
