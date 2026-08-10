import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorState, ErrorScreenState } from "@/components/ErrorState";
import { ReplaceDraftDialog } from "@/components/ReplaceDraftDialog";
import { SkeletonList } from "@/components/Skeleton";
import { useStartRequest } from "@/hooks/useStartRequest";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatUnitPrice } from "@/lib/catalog";
import { userFacingError } from "@/lib/copy";
import {
  findCategory,
  productsForSubcategory,
  splitByAvailability,
  type ProductCategory,
  type ProductSubcategory,
} from "@/lib/productCategories";
import { useRequestDraft } from "@/store/requestDraft";

/**
 * One category, and the things inside it.
 *
 * The subcategories are split by whether the app can price them today. That is
 * a real difference, not a defect to hide: GRIDGO prints acrylic build-up
 * letters, but nothing in the catalog prices them, so an order created against
 * a guessed product would be the wrong job. Those rows say who quotes them and
 * are not tappable — a control that cannot act must not look like one.
 */
export default function CategoryScreen() {
  const { category: categoryCode } = useLocalSearchParams<{ category: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const { start, pendingLabel, confirmReplace, cancelReplace } = useStartRequest();

  const [categories, setCategories] = useState<ProductCategory[] | null>(null);
  const [catalog, setCatalog] = useState<api.CatalogProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Subcategory whose several catalog products are showing. */
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [tree, products] = await Promise.all([
        api.getProductCategories(),
        api.listCatalog(),
      ]);
      setCategories(tree);
      setCatalog(products);
      setError(null);
    } catch (e) {
      setCategories(null);
      setError(
        userFacingError(e, "Could not load this category. Check your connection and try again."),
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const category = findCategory(categories ?? [], categoryCode);

  const choose = (product: api.CatalogProduct) => {
    start(product.name, () => useRequestDraft.getState().selectProduct(product));
  };

  const pick = (subcategory: ProductSubcategory) => {
    const products = productsForSubcategory(subcategory, catalog);
    if (products.length === 1) {
      choose(products[0]);
      return;
    }
    setExpanded((current) => (current === subcategory.code ? null : subcategory.code));
  };

  if (error && !categories) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["bottom"]}>
        <ErrorScreenState label="Could not load" body={error} onRetry={() => void load()} />
      </SafeAreaView>
    );
  }

  if (!categories) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["bottom"]}>
        <View className="gg-page gap-4 pt-6">
          <Text className="text-body text-text-muted">Loading this category…</Text>
          <SkeletonList count={4} />
        </View>
      </SafeAreaView>
    );
  }

  if (!category) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["bottom"]}>
        <View className="gg-page gap-4 pt-6">
          <ErrorState
            label="Category not found"
            body="This category is no longer listed. Go back and choose from what GRIDGO prints today."
            retryLabel="Back to categories"
            onRetry={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const { orderable, quotedByOperations } = splitByAvailability(
    category.subcategories,
    catalog,
  );
  /*
    A group label is only information against the group it is being told apart
    from. Where a category is entirely priced, or entirely quoted, the overline
    heads the only list on the screen and says nothing the list does not — and
    in the quoted-only case the sentence underneath already says it in words.
  */
  const split = orderable.length > 0 && quotedByOperations.length > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page pb-16 pt-2">
          <Text className="text-h1 text-text-primary">{category.name}</Text>
          {category.bestFor ? (
            <Text className="mt-3 text-body-lg text-text-secondary">
              Best for {lowerFirst(category.bestFor)}
            </Text>
          ) : null}

          {error ? (
            <View className="mt-6">
              <ErrorState label="Prices may be stale" body={error} onRetry={() => void load()} />
            </View>
          ) : null}

          {orderable.length ? (
            <View className="mt-8 gap-3">
              {split ? (
                <Text className="text-overline text-text-muted">ORDER IN THE APP</Text>
              ) : null}
              {orderable.map((subcategory) => (
                <SubcategoryRow
                  key={subcategory.code}
                  subcategory={subcategory}
                  products={productsForSubcategory(subcategory, catalog)}
                  expanded={expanded === subcategory.code}
                  onPress={() => pick(subcategory)}
                  onChooseProduct={choose}
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
                GRIDGO prints {split ? "these too" : "these"}. They are not priced in the
                app yet, so Operations quotes them with you directly.
              </Text>
              <View className="gg-panel gap-4">
                {quotedByOperations.map((subcategory) => (
                  <View key={subcategory.code} className="gap-1">
                    <Text className="text-body-lg text-text-primary">{subcategory.name}</Text>
                    {subcategory.examples ? (
                      <Text className="text-caption text-text-muted">
                        {subcategory.examples}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <ReplaceDraftDialog
        label={pendingLabel}
        onConfirm={confirmReplace}
        onCancel={cancelReplace}
      />
    </SafeAreaView>
  );
}

function SubcategoryRow({
  subcategory,
  products,
  expanded,
  onPress,
  onChooseProduct,
}: {
  subcategory: ProductSubcategory;
  products: api.CatalogProduct[];
  expanded: boolean;
  onPress: () => void;
  onChooseProduct: (product: api.CatalogProduct) => void;
}) {
  const colors = useThemeColors();
  const single = products.length === 1 ? products[0] : null;

  return (
    <View className="gg-card-flush">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={subcategory.name}
        accessibilityHint={
          single
            ? `Starts a request for ${single.name}`
            : `Shows ${products.length} products`
        }
        accessibilityState={single ? undefined : { expanded }}
        className="gg-touch flex-row items-center gap-3 p-4"
      >
        {({ pressed }) => (
          <>
            <View className="flex-1">
              <Text className="text-body-lg font-medium text-text-primary">
                {subcategory.name}
              </Text>
              {subcategory.examples ? (
                <Text className="mt-1 text-caption text-text-muted">
                  {subcategory.examples}
                </Text>
              ) : null}
              {single ? (
                <Text className="mt-2 text-caption text-text-secondary">
                  From {formatUnitPrice(single.basePriceMinor, single.unit)}
                </Text>
              ) : (
                <Text className="mt-2 text-caption text-text-secondary">
                  {products.length} products
                </Text>
              )}
            </View>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
            {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
          </>
        )}
      </Pressable>

      {/* Inline disclosure rather than a sheet: it is two or three rows of the
          same list, and a sheet for that is ceremony with no payoff. */}
      {expanded && !single
        ? products.map((product) => (
            <Pressable
              key={product.id}
              onPress={() => onChooseProduct(product)}
              accessibilityRole="button"
              accessibilityLabel={`${product.name}, from ${formatUnitPrice(product.basePriceMinor, product.unit)}`}
              className="gg-touch flex-row items-center justify-between gap-3 border-t border-outline-subtle bg-surface-variant px-4 py-3"
            >
              {({ pressed }) => (
                <>
                  <Text className="flex-1 text-body text-text-primary">{product.name}</Text>
                  <Text className="text-caption text-text-muted">
                    From {formatUnitPrice(product.basePriceMinor, product.unit)}
                  </Text>
                  {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
                </>
              )}
            </Pressable>
          ))
        : null}
    </View>
  );
}

function lowerFirst(sentence: string): string {
  if (!sentence) return sentence;
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}
