import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { Search, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View, type TextStyle } from "react-native";
import { useRouter } from "expo-router";

import { FormScreen } from "@/components/FormScreen";
import { useStartPrintJob } from "@/hooks/useStartPrintJob";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import {
  searchSubcategories,
  type ProductCategory,
  type ProductSubcategory,
} from "@/lib/productCategories";

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
  const startJob = useStartPrintJob();

  const [categories, setCategories] = useState<ProductCategory[]>(() => api.productCategoriesNow());
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  // Seed is already the tree. Refresh in the background; never blank the
  // picker on a taxonomy blip. Focus and live events read through the cache.
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const tree = await api.getProductCategories().catch(() => null);
    if (tree && sequence === loadSequence.current) setCategories(tree);
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate the latest request on cleanup; this ref is a sequence counter, not a node.
    return () => { loadSequence.current++; };
  }, [load]);

  useLiveRefresh(["catalog"], load);

  const hits = useMemo(() => searchSubcategories(categories, query), [categories, query]);
  const searching = query.trim().length >= 2;

  // A search hit goes straight to the shop that prints it. Whether anyone does
  // is a question only the boards can answer, and the match screen answers it
  // in one cheap read — guessing here from the platform catalog would tell a
  // client "not priced yet" about a thing a shop has on its board today.
  const openSubcategory = (category: ProductCategory, subcategory: ProductSubcategory) => {
    startJob(category.code, subcategory.code);
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
    <FormScreen>
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

        {searching ? (
          <SearchResults
            hits={hits}
            query={query.trim()}
            onPick={openSubcategory}
            onBrowse={() => setQuery("")}
          />
        ) : (
          <View className="mt-8 gap-3">
            {categories.map((category) => (
              <CategoryCard
                key={category.code}
                category={category}
                onPress={() => router.push(`/request/${category.code}`)}
              />
            ))}
          </View>
        )}
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
  onPick,
  onBrowse,
}: {
  hits: { category: ProductCategory; subcategory: ProductSubcategory }[];
  query: string;
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
          onPress={() => onPick(category, subcategory)}
        />
      ))}
    </View>
  );
}

function SubcategoryResult({
  category,
  subcategory,
  onPress,
}: {
  category: ProductCategory;
  subcategory: ProductSubcategory;
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
