import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/Screen";
import { ErrorState } from "@/components/ErrorState";
import { useStartPrintJob } from "@/hooks/useStartPrintJob";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { findCategory, type ProductCategory, type ProductSubcategory } from "@/lib/productCategories";
import {
  listingsFor,
  loadCategoryBoards,
  orderableSubcategories,
} from "@/lib/shopBoards";

/**
 * One category, and the things inside it.
 *
 * The split is between what a shop is printing today and what only Operations
 * can quote — and it is read from the shops' own boards rather than guessed
 * from the platform catalog. That difference is the whole marketplace: GRIDGO
 * prints acrylic build-up letters, but if no approved shop has them on a board
 * there is nobody to match a client to, and a row that looks tappable would end
 * on a screen saying so.
 *
 * The boards are cached for a minute, so the match screen this leads to almost
 * always has them already.
 */
export default function CategoryScreen() {
  const { category: categoryCode } = useLocalSearchParams<{ category: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const startJob = useStartPrintJob();

  const [categories, setCategories] = useState<ProductCategory[]>(() => api.productCategoriesNow());
  const [boards, setBoards] = useState<api.ShopBoard[] | null>(null);
  const [boardsError, setBoardsError] = useState<string | null>(null);

  const loadBoards = useCallback(async () => {
    if (!categoryCode) return;
    try {
      const read = await loadCategoryBoards(categoryCode);
      setBoards(read.boards);
      setBoardsError(null);
    } catch (e) {
      setBoards(null);
      setBoardsError(
        userFacingError(e, "GRIDGO could not read today's prices, so this list may be short."),
      );
    }
  }, [categoryCode]);

  useEffect(() => {
    let alive = true;
    void api.getProductCategories().then((tree) => {
      if (alive) setCategories(tree);
    }).catch(() => {
      // Seed already on screen.
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  const category = findCategory(categories, categoryCode);

  const listed = useMemo(
    () => (boards ? orderableSubcategories(boards) : null),
    [boards],
  );

  if (!category) {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page gap-4 pt-6">
          <ErrorState
            label="Category not found"
            body="This category is no longer listed. Go back and choose from what GRIDGO prints today."
            retryLabel="Back to categories"
            onRetry={() => router.back()}
          />
        </View>
      </Screen>
    );
  }

  // Until the boards land, nothing is claimed either way: every row is shown as
  // itself and the split appears once GRIDGO knows who is printing what.
  const onBoards = listed
    ? category.subcategories.filter((entry) => listed.has(entry.code))
    : category.subcategories;
  const quotedByOperations = listed
    ? category.subcategories.filter((entry) => !listed.has(entry.code))
    : [];
  const split = onBoards.length > 0 && quotedByOperations.length > 0;

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page pb-16 pt-2">
          <Text className="text-h1 text-text-primary">{category.name}</Text>
          {category.bestFor ? (
            <Text className="mt-3 text-body-lg text-text-secondary">
              Best for {lowerFirst(category.bestFor)}
            </Text>
          ) : null}

          {boardsError ? (
            <View className="mt-6">
              <ErrorState
                label="Prices not loaded"
                body={boardsError}
                onRetry={() => void loadBoards()}
              />
            </View>
          ) : null}

          {onBoards.length ? (
            <View className="mt-8 gap-3">
              {split ? (
                <Text className="text-overline text-text-muted">GRIDGO PRINTS THESE NOW</Text>
              ) : null}
              {onBoards.map((subcategory) => (
                <SubcategoryRow
                  key={subcategory.code}
                  subcategory={subcategory}
                  boards={boards}
                  onPress={() => startJob(category.code, subcategory.code)}
                />
              ))}
            </View>
          ) : null}

          {quotedByOperations.length ? (
            <View className="mt-8 gap-3">
              {split ? (
                <Text className="text-overline text-text-muted">QUOTED BY OPERATIONS</Text>
              ) : null}
              <Text className="text-body text-text-secondary">
                GRIDGO prints {split ? "these too" : "these"}. None of them is on a press
                today, so Operations quotes them with you directly.
              </Text>
              <View className="gg-panel gap-4">
                {quotedByOperations.map((subcategory) => (
                  <View key={subcategory.code} className="gap-1">
                    <Text className="text-body-lg text-text-primary">{subcategory.name}</Text>
                    {subcategory.examples ? (
                      <Text className="text-caption text-text-muted">{subcategory.examples}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

/**
 * One thing to print.
 *
 * The row carries what a client is choosing between: the thing itself and what
 * it starts at. Not how many shops print it — that is a number nobody can act
 * on, it invites the comparing this flow exists to remove, and it makes GRIDGO
 * read as a directory rather than the counter. The price is read from the
 * boards, so it appears once they have landed.
 */
function SubcategoryRow({
  subcategory,
  boards,
  onPress,
}: {
  subcategory: ProductSubcategory;
  boards: api.ShopBoard[] | null;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  const cheapest = boards
    ? boards
        .flatMap((board) => listingsFor(board, subcategory.code))
        .reduce<number | null>(
          (low, item) => (low == null ? item.fromPriceMinor : Math.min(low, item.fromPriceMinor)),
          null,
        )
    : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subcategory.name}
      accessibilityHint="Finds GRIDGO's printer for this"
      className="gg-card-flush flex-row items-center gap-3 p-4"
    >
      {({ pressed }) => (
        <>
          <View className="min-w-0 flex-1">
            <Text className="text-body-lg font-medium text-text-primary">
              {subcategory.name}
            </Text>
            {subcategory.examples ? (
              <Text className="mt-1 text-caption text-text-muted">{subcategory.examples}</Text>
            ) : null}
            {boards ? (
              <Text className="mt-2 text-caption text-text-secondary">
                {cheapest != null
                  ? `From ${formatPhp(cheapest)}`
                  : "Priced when GRIDGO matches you"}
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

function lowerFirst(sentence: string): string {
  if (!sentence) return sentence;
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}
