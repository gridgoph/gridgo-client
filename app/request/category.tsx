import { Search, X } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View, type TextStyle } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { ReplaceDraftDialog } from "@/components/ReplaceDraftDialog";
import { SkeletonList } from "@/components/Skeleton";
import { useStartRequest } from "@/hooks/useStartRequest";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  productsForSubcategory,
  searchSubcategories,
  type ProductCategory,
  type ProductSubcategory,
} from "@/lib/productCategories";
import { useRequestDraft } from "@/store/requestDraft";

/**
 * The front of the print request: what are you printing?
 *
 * This sits *ahead* of the four-step stepper rather than inside it. The stepper
 * specifies a job the client has already decided to make — product, size,
 * material, deadline, address. Deciding what to make is a different act, it is
 * the one place a client browses rather than fills in, and a reorder skips it
 * entirely. Folding it in as a fifth pill would put five labels across a phone
 * and would make Details unreachable for someone who only wants to look.
 *
 * Two ways through, because clients arrive in two states. Someone who knows
 * searches — over examples as well as names, since "tote bag" and "x-stand" are
 * what people actually type. Someone who does not reads the four categories and
 * the audience line under each, which is written to be recognised: a client
 * finds themselves in "student orgs, HR teams, event organizers" and stops
 * there.
 */
export default function ChooseCategoryScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { start, pendingLabel, confirmReplace, cancelReplace } = useStartRequest();

  const [categories, setCategories] = useState<ProductCategory[] | null>(null);
  const [catalog, setCatalog] = useState<api.CatalogProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

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
        userFacingError(
          e,
          "Could not load what GRIDGO prints. Check your connection and try again.",
        ),
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const hits = useMemo(
    () => (categories ? searchSubcategories(categories, query) : []),
    [categories, query],
  );
  const searching = query.trim().length >= 2;

  // A search hit that resolves to exactly one catalog product is the fast path
  // and goes straight into the request. Anything else — several products, or
  // nothing priced yet — needs the context the category screen gives it.
  const openSubcategory = (category: ProductCategory, subcategory: ProductSubcategory) => {
    const products = productsForSubcategory(subcategory, catalog);
    if (products.length === 1) {
      const product = products[0];
      start(product.name, () => useRequestDraft.getState().selectProduct(product));
      return;
    }
    router.push(`/request/${category.code}`);
  };

  return (
    /*
      A stack header already sits above this screen and has already cleared
      the status bar, so `edges={["top"]}` would inset it a second time and
      push the heading down a notch's worth. Bottom only, matching the sibling
      category screen.

      Through `FormScreen` for the search field: results grow under it, and
      once the list is longer than the screen the field has to be scrolled
      clear of the keyboard rather than left underneath it.
    */
    <FormScreen
      overlay={
        <ReplaceDraftDialog
          label={pendingLabel}
          onConfirm={confirmReplace}
          onCancel={cancelReplace}
        />
      }
    >
      <View className="gg-page pb-16 pt-2">
        {/* The one bold moment on this screen. Everything below stays quiet. */}
        <Text className="text-display text-text-primary">What are you printing?</Text>
        <Text className="mt-3 text-body-lg text-text-secondary">
          Pick the closest match. You set the exact size, material and quantity next.
        </Text>

        {/* Focus is shown on the whole field, not on the bare input inside
            it — a ring drawn inside the rounded box reads as a broken
            control. Never suppressed, just moved to the right element. */}
        <View
          className={
            focused
              ? "mt-6 flex-row items-center gap-3 rounded-field border-2 border-accent bg-surface px-3"
              : "mt-6 flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3"
          }
        >
          <Search size={18} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            className="h-12 flex-1 text-body text-text-primary"
            style={NO_NATIVE_OUTLINE}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            value={query}
            onChangeText={setQuery}
            placeholder="Search — tarpaulin, tote bag, lanyard"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search what GRIDGO prints"
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery("")}
              className="gg-touch items-center justify-center"
            >
              <X size={18} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <View className="mt-8">
            <ErrorState
              label="Could not load"
              body={error}
              onRetry={() => void load()}
            />
          </View>
        ) : null}

        {!categories && !error ? (
          <View className="mt-8 gap-4">
            <Text className="text-body text-text-muted">Loading what GRIDGO prints…</Text>
            <SkeletonList count={4} />
          </View>
        ) : null}

        {categories && searching ? (
          <SearchResults
            hits={hits}
            query={query.trim()}
            catalog={catalog}
            onPick={openSubcategory}
            onBrowse={() => setQuery("")}
          />
        ) : null}

        {categories && !searching ? (
          <View className="mt-8 gap-3">
            {categories.map((category) => (
              <CategoryCard
                key={category.code}
                category={category}
                onPress={() => router.push(`/request/${category.code}`)}
              />
            ))}
          </View>
        ) : null}
      </View>
    </FormScreen>
  );
}

function CategoryCard({
  category,
  onPress,
}: {
  category: ProductCategory;
  onPress: () => void;
}) {
  const names = category.subcategories.map((s) => s.name).join(" · ");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}. Best for ${category.bestFor}`}
      accessibilityHint={`${category.subcategories.length} things to print`}
      className="gg-card"
    >
      {({ pressed }) => (
        <>
          <Text className="text-h3 text-text-primary">{category.name}</Text>
          <Text className="mt-2 text-body text-text-secondary">
            Best for {lowerFirst(category.bestFor)}
          </Text>
          <Text className="mt-3 text-caption text-text-muted" numberOfLines={2}>
            {names}
          </Text>
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-card" /> : null}
        </>
      )}
    </Pressable>
  );
}

function SearchResults({
  hits,
  query,
  catalog,
  onPick,
  onBrowse,
}: {
  hits: { category: ProductCategory; subcategory: ProductSubcategory }[];
  query: string;
  catalog: api.CatalogProduct[];
  onPick: (category: ProductCategory, subcategory: ProductSubcategory) => void;
  onBrowse: () => void;
}) {
  if (!hits.length) {
    return (
      <View className="mt-8 gg-panel gap-3 py-8">
        <Text className="text-center text-body-lg font-medium text-text-primary">
          Nothing matches “{query}”
        </Text>
        <Text className="text-center text-body text-text-muted">
          GRIDGO may still print it. Clear the search and read the four categories — the
          examples under each one cover more than their names do.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onBrowse}
          className="gg-btn-secondary self-center px-6"
        >
          <Text className="text-button text-text-primary">Browse the categories</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="mt-8 gap-3">
      <Text className="text-overline text-text-muted">
        {hits.length} {hits.length === 1 ? "MATCH" : "MATCHES"}
      </Text>
      {hits.map(({ category, subcategory }) => (
        <SubcategoryResult
          key={`${category.code}/${subcategory.code}`}
          category={category}
          subcategory={subcategory}
          orderable={productsForSubcategory(subcategory, catalog).length > 0}
          onPress={() => onPick(category, subcategory)}
        />
      ))}
    </View>
  );
}

function SubcategoryResult({
  category,
  subcategory,
  orderable,
  onPress,
}: {
  category: ProductCategory;
  subcategory: ProductSubcategory;
  orderable: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${subcategory.name}, in ${category.name}`}
      className="gg-card"
    >
      {({ pressed }) => (
        <>
          <Text className="text-overline text-text-muted">
            {category.name.toUpperCase()}
          </Text>
          <Text className="mt-1 text-body-lg font-medium text-text-primary">
            {subcategory.name}
          </Text>
          {subcategory.examples ? (
            <Text className="mt-1 text-caption text-text-muted">{subcategory.examples}</Text>
          ) : null}
          {!orderable ? (
            <Text className="mt-2 text-caption text-text-secondary">
              Quoted by Operations — not priced in the app yet
            </Text>
          ) : null}
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-card" /> : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * The wrapper carries the focus ring, so the input must not draw its own.
 * `outlineStyle` is a react-native-web style with no native counterpart, hence
 * the cast — there is no className for it.
 */
const NO_NATIVE_OUTLINE = { outlineStyle: "none" } as unknown as TextStyle;

/** "Businesses, startups…" reads as a clause after "Best for". */
function lowerFirst(sentence: string): string {
  if (!sentence) return sentence;
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}
