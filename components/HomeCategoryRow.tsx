import {
  Award,
  BookOpen,
  Box,
  ChevronRight,
  FileText,
  Megaphone,
  Shirt,
  type LucideIcon,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { CropMarkFrame } from "@/components/CropMarkFrame";
import { useThemeColors } from "@/hooks/useTheme";
import {
  categoryExamples,
  categoryGlyph,
  categoryShortName,
  type CategoryGlyph,
} from "@/lib/categoryLook";
import type { ProductCategory } from "@/lib/productCategories";

type Props = {
  category: ProductCategory;
  onPress: () => void;
};

/**
 * The icons this row draws a category with, keyed by their glyph name.
 *
 * A registry rather than Lucide's whole surface, the same shape `StatusChip`
 * keeps: the vocabulary stays small enough to be consistent, and swapping the
 * icon set later is one file.
 */
const ICONS = {
  megaphone: Megaphone,
  shirt: Shirt,
  award: Award,
  box: Box,
  book: BookOpen,
  sheet: FileText,
} satisfies Record<CategoryGlyph, LucideIcon>;

/**
 * One family GRIDGO prints, as a row on the start board.
 *
 * Home's second question is how to start something new, and this is the menu
 * that answers it. It was a half-width tile in a two-up grid, and a grid was
 * the wrong shape for five things on a phone: the fifth tile sat alone beside
 * an empty half-row, every target was half a screen wide, and the one line a
 * person actually reads — what is inside the category — was cut off mid-item
 * on three of the five ("Plaques & Trophies and 2 …"). A menu nobody can read
 * is not a menu.
 *
 * Full width fixes all three at once. The contents line is set whole, the
 * whole row is the target, and five rows stack into one scan down the left
 * edge instead of a zig-zag across two columns. It is also shorter than the
 * grid was, so the board no longer pushes itself off the screen.
 *
 * The mark sits in crop marks. That is not decoration — the same frame trims
 * the shops' real sample photos further into the app and on the supplier's
 * side of the counter, so the menu and the samples read as one board rather
 * than as a product list borrowed from a shopping app. It is also what tells
 * these rows apart from the needs-you docket above them, which carries no mark.
 *
 * Still ink, never yellow: the floating "+" owns the primary start, and these
 * jump into a category rather than opening the full picker.
 */
export function HomeCategoryRow({ category, onPress }: Props) {
  const colors = useThemeColors();
  const Icon = ICONS[categoryGlyph(category)];
  const caption = categoryExamples(category);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // The catalogue name, not the short label. A screen reader gets the
      // governed name whatever the row had room to print.
      accessibilityLabel={category.name}
      accessibilityHint={category.bestFor ? `Best for ${category.bestFor}` : undefined}
      className="gg-touch flex-row items-center gap-3 px-4 py-3"
    >
      {({ pressed }) => (
        <>
          <View className="w-12 shrink-0">
            <CropMarkFrame gutter="tight">
              {/*
                A landscape well, because a print sample is a sheet. Native
                aspectRatio rather than an arbitrary `aspect-[4/3]` class —
                that spelling has shipped as a silent no-op in this pipeline.
              */}
              <View
                className="w-full items-center justify-center"
                style={{ aspectRatio: 4 / 3 }}
              >
                <Icon size={18} color={colors.textPrimary} strokeWidth={1.75} />
              </View>
            </CropMarkFrame>
          </View>

          <View className="min-w-0 flex-1">
            <Text className="text-body-lg font-medium text-text-primary" numberOfLines={1}>
              {categoryShortName(category)}
            </Text>
            {caption ? (
              <Text className="mt-0.5 text-caption text-text-muted" numberOfLines={2}>
                {caption}
              </Text>
            ) : null}
          </View>

          <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
        </>
      )}
    </Pressable>
  );
}
