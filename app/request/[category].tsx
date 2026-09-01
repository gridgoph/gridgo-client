import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { CategoryHuntField } from "@/components/CategoryHuntField";
import { CategorySampleCard, CategorySampleRow } from "@/components/CategorySample";
import { CategoryViewToggle } from "@/components/CategoryViewToggle";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { useCategoryView } from "@/hooks/useCategoryView";
import { useStartPrintJob } from "@/hooks/useStartPrintJob";
import * as api from "@/lib/api";
import { isHunting, subcategoryMatchesHunt } from "@/lib/categoryBrowse";
import { userFacingError } from "@/lib/copy";
import { findCategory, type ProductCategory, type ProductSubcategory } from "@/lib/productCategories";
import {
  loadCategoryBoards,
  orderableSubcategories,
  pickListingFor,
} from "@/lib/shopBoards";

/**
 * One category, as a wall of samples or a list of quotes.
 *
 * A client picking flyers is looking at printed work, the same way a shop looks
 * at its own board — so the photo is the tile and the text-only rows are gone.
 * Search hunts those samples. Wall and list are the same two drawings the shop
 * already uses, without the plus or the filters: a client is choosing, not
 * stocking.
 *
 * The split is still what a shop is printing today versus what only Operations
 * can quote, read from the shops' own boards.
 */
export default function CategoryScreen() {
  const { category: categoryCode } = useLocalSearchParams<{ category: string }>();
  const router = useRouter();
  const startJob = useStartPrintJob();
  const [view, setView] = useCategoryView();
  const [hunt, setHunt] = useState("");

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

  const onBoards = listed
    ? category?.subcategories.filter((entry) => listed.has(entry.code)) ?? []
    : category?.subcategories ?? [];
  const quotedByOperations = listed
    ? category?.subcategories.filter((entry) => !listed.has(entry.code)) ?? []
    : [];

  const huntedOnBoards = onBoards.filter((entry) =>
    subcategoryMatchesHunt(entry, boards ? pickListingFor(boards, entry.code) : null, hunt),
  );
  const huntedQuoted = quotedByOperations.filter((entry) =>
    subcategoryMatchesHunt(entry, null, hunt),
  );
  const hunting = isHunting(hunt);
  const split = huntedOnBoards.length > 0 && huntedQuoted.length > 0 && !hunting;
  const huntMissed = hunting && huntedOnBoards.length === 0 && huntedQuoted.length === 0;

  if (!category) {
    return (
      <FormScreen>
        <View className="gg-page gap-4 pt-6">
          <ErrorState
            label="Category not found"
            body="This category is no longer listed. Go back and choose from what GRIDGO prints today."
            retryLabel="Back to categories"
            onRetry={() => router.back()}
          />
        </View>
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <View className="gg-page pb-16 pt-2">
        <Text className="text-h1 text-text-primary">{category.name}</Text>

        {boardsError ? (
          <View className="mt-6">
            <ErrorState
              label="Prices not loaded"
              body={boardsError}
              onRetry={() => void loadBoards()}
            />
          </View>
        ) : null}

        <View className="mt-6 gap-3">
          <View className="flex-row items-center gap-3">
            <View className="min-w-0 flex-1">
              {listed && huntedOnBoards.length > 0 ? (
                <Text className="text-overline text-text-muted">
                  {split ? "GRIDGO PRINTS THESE NOW" : "ON PRESS TODAY"}
                </Text>
              ) : null}
            </View>
            <CategoryViewToggle view={view} onViewChange={setView} />
          </View>
          <CategoryHuntField
            value={hunt}
            onChange={setHunt}
            categoryName={category.name}
          />
        </View>

        {!boards && !boardsError ? (
          <View
            className="mt-3"
            accessibilityRole="progressbar"
            accessibilityLabel="Loading today's samples"
          >
            <View className="-mx-1.5 flex-row flex-wrap">
              {[0, 1, 2, 3].map((key) => (
                <View key={key} className="w-1/2 px-1.5 pb-3">
                  <SkeletonBlock className="h-56 w-full rounded-card" />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {boards && huntMissed ? (
          <View className="mt-3 gap-3 rounded-card border border-outline bg-surface p-4">
            <Text className="text-body text-text-secondary">
              Nothing in this category matches. Try a different word.
            </Text>
            <SecondaryButton label="Clear search" onPress={() => setHunt("")} />
          </View>
        ) : null}

        {boards && huntedOnBoards.length ? (
          <View className="mt-3">
            {view === "wall" ? (
              <View className="-mx-1.5 flex-row flex-wrap">
                {huntedOnBoards.map((subcategory) => (
                  <View key={subcategory.code} className="w-1/2 px-1.5 pb-3">
                    <CategorySampleCard
                      subcategory={subcategory}
                      listing={pickListingFor(boards, subcategory.code)}
                      onPress={() => startJob(category.code, subcategory.code)}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <View className="gap-3">
                {huntedOnBoards.map((subcategory) => (
                  <CategorySampleRow
                    key={subcategory.code}
                    subcategory={subcategory}
                    listing={pickListingFor(boards, subcategory.code)}
                    onPress={() => startJob(category.code, subcategory.code)}
                  />
                ))}
              </View>
            )}
          </View>
        ) : null}

        {huntedQuoted.length ? (
          <QuotedPanel
            items={huntedQuoted}
            split={split}
          />
        ) : null}
      </View>
    </FormScreen>
  );
}

function QuotedPanel({
  items,
  split,
}: {
  items: ProductSubcategory[];
  split: boolean;
}) {
  return (
    <View className="mt-8 gap-3">
      {split ? (
        <Text className="text-overline text-text-muted">QUOTED BY OPERATIONS</Text>
      ) : null}
      <Text className="text-body text-text-secondary">
        GRIDGO prints {split ? "these too" : "these"}. None of them is on a press
        today, so Operations quotes them with you directly.
      </Text>
      <View className="gg-panel gap-4">
        {items.map((subcategory) => (
          <View key={subcategory.code} className="gap-1">
            <Text className="text-body-lg text-text-primary">{subcategory.name}</Text>
            {subcategory.examples ? (
              <Text className="text-caption text-text-muted">{subcategory.examples}</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
