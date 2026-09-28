import { ChevronRight, Search, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
  type TextStyle,
} from "react-native";
import { useFocusEffect } from "expo-router";

import { useThemeColors } from "@/hooks/useTheme";
import { homeSearch, homeSearchAnnouncement, splitMatch } from "@/lib/homeSearch";
import type { ProductCategory, ProductSubcategory } from "@/lib/productCategories";

type Props = {
  categories: ProductCategory[];
  /** A result was chosen: continue exactly as picking it in the picker does. */
  onPick: (category: ProductCategory, subcategory: ProductSubcategory) => void;
  /** The full picker, carrying the query when there is one worth carrying. */
  onOpenPicker: (query: string | null) => void;
  /**
   * The field wants room under it. Home scrolls it up so the results sit
   * between the field and the keyboard rather than behind the keyboard.
   */
  onActivate?: () => void;
};

/** How long the results sit still before a screen reader hears the count. */
const ANNOUNCE_AFTER_MS = 600;

/**
 * Home's search, typed into where it sits (gridgo-client#137).
 *
 * It used to be a button into the picker, on the reasoning that a real input
 * would keep a second search state in step with the picker's. Clients asked to
 * type here instead, and the answer to that worry is that there is still one
 * search: `lib/homeSearch.ts` reads the picker's own `searchSubcategories` and
 * only cuts it to a dropdown. Picking a result goes through the same
 * `useStartPrintJob` the picker uses, and "See all" hands the query to the
 * picker, which still owns the long list and the categories' audience lines.
 *
 * The dropdown is laid out inline, not floated over the board. On Android a
 * child drawn outside its parent's box receives no touches, so an overlay
 * dropdown would paint results nobody could tap. Inline, it pushes the board
 * down, and Home scrolls the field to the top so it has room.
 *
 * It closes when the keyboard goes — a tap outside, Android back, a drag —
 * and keeps what was typed, so tapping the field again brings the same
 * results back. It is ink, not yellow: the floating "+" is still the screen's
 * one primary action.
 */
export function HomeSearch({ categories, onPick, onOpenPicker, onActivate }: Props) {
  const colors = useThemeColors();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(false);
  // A press on a result began. On web the field blurs on pointer-down, before
  // the press lands; closing then would remove the row being pressed.
  const choosing = useRef(false);

  const search = useMemo(() => homeSearch(categories, query), [categories, query]);
  const showResults = open && search.searching;

  const close = useCallback(() => {
    setOpen(false);
    inputRef.current?.blur();
  }, []);

  useEffect(() => {
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      if (focusedRef.current) close();
    });
    // The keyboard's own height only exists once it is up; scroll again then.
    const show = Keyboard.addListener("keyboardDidShow", () => {
      if (focusedRef.current) onActivate?.();
    });
    return () => {
      hide.remove();
      show.remove();
    };
  }, [close, onActivate]);

  // Leaving Home by any route — a category row, a tab — takes the keyboard
  // with it rather than leaving it up over the next screen.
  useFocusEffect(
    useCallback(() => () => {
      setOpen(false);
      inputRef.current?.blur();
    }, []),
  );

  useEffect(() => {
    if (!showResults) return;
    const timer = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(homeSearchAnnouncement(search, query));
    }, ANNOUNCE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [showResults, search, query]);

  const pick = (category: ProductCategory, subcategory: ProductSubcategory) => {
    choosing.current = false;
    setQuery("");
    close();
    onPick(category, subcategory);
  };

  const openPicker = (carry: boolean) => {
    choosing.current = false;
    const typed = query.trim();
    close();
    onOpenPicker(carry && typed ? typed : null);
  };

  const pressIn = () => {
    choosing.current = true;
  };
  const pressOut = () => {
    choosing.current = false;
  };

  const more = search.total - search.rows.length;

  return (
    <View>
      {/* Focus is drawn on the whole field, as on the picker's. */}
      <View
        className={
          focused
            ? "flex-row items-center gap-3 rounded-field border-2 border-accent bg-surface px-3"
            : "flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3"
        }
      >
        <Search size={18} color={colors.textMuted} strokeWidth={2} />
        <TextInput
          ref={inputRef}
          className="h-12 flex-1 text-body text-text-primary"
          style={NO_NATIVE_OUTLINE}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setOpen(true);
          }}
          onFocus={() => {
            focusedRef.current = true;
            setFocused(true);
            setOpen(true);
            onActivate?.();
          }}
          onBlur={() => {
            focusedRef.current = false;
            setFocused(false);
            if (!choosing.current) setOpen(false);
          }}
          // Android keeps the field focused when back hides the keyboard, so a
          // second tap raises no focus event. It still presses.
          onPressIn={() => setOpen(true)}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === "Escape") close();
          }}
          onSubmitEditing={() => {
            if (search.searching) openPicker(true);
          }}
          placeholder="What are you printing?"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search what GRIDGO prints"
          accessibilityHint="Matching categories appear below as you type"
        />
        {query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPressIn={pressIn}
            onPressOut={pressOut}
            onPress={() => {
              choosing.current = false;
              setQuery("");
              inputRef.current?.focus();
            }}
            className="gg-touch items-center justify-center"
          >
            <X size={18} color={colors.textSecondary} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      {showResults ? (
        <View className="mt-2 gg-card-flush" testID="home-search-results">
          {search.rows.length ? (
            search.rows.map((row, index) => (
              <View key={`${row.category.code}/${row.subcategory.code}`}>
                {index > 0 ? <View className="gg-divider" /> : null}
                <ResultRow
                  name={row.subcategory.name}
                  caption={row.caption}
                  query={query}
                  accessibilityLabel={`${row.subcategory.name}, in ${row.category.name}`}
                  onPressIn={pressIn}
                  onPressOut={pressOut}
                  onPress={() => pick(row.category, row.subcategory)}
                />
              </View>
            ))
          ) : (
            <View className="px-4 py-4" accessible>
              <Text className="text-body-lg font-medium text-text-primary">
                Nothing matches “{query.trim()}”
              </Text>
              <Text className="mt-1 text-body text-text-muted">
                GRIDGO may still print it. Each category lists more than its name says.
              </Text>
            </View>
          )}

          {more > 0 || !search.rows.length ? (
            <>
              <View className="gg-divider" />
              <Pressable
                accessibilityRole="button"
                onPressIn={pressIn}
                onPressOut={pressOut}
                onPress={() => openPicker(more > 0)}
                className="gg-touch flex-row items-center gap-3 bg-surface-variant px-4 py-3"
              >
                {({ pressed }) => (
                  <>
                    <Text className="flex-1 text-button text-text-primary">
                      {more > 0 ? `See all ${search.total} matches` : "Browse every category"}
                    </Text>
                    <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
                    {pressed ? (
                      <View pointerEvents="none" className="gg-pressed absolute inset-0" />
                    ) : null}
                  </>
                )}
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ResultRow({
  name,
  caption,
  query,
  accessibilityLabel,
  onPress,
  onPressIn,
  onPressOut,
}: {
  name: string;
  caption: string;
  query: string;
  accessibilityLabel: string;
  onPress: () => void;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="gg-touch flex-row items-center gap-3 px-4 py-3"
    >
      {({ pressed }) => (
        <>
          <View className="min-w-0 flex-1">
            <Matched
              text={name}
              query={query}
              className="text-body-lg text-text-primary"
            />
            <Matched
              text={caption}
              query={query}
              className="mt-0.5 text-caption text-text-muted"
            />
          </View>
          <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * The typed part in bold, the rest regular — the way a client checks at a
 * glance that the row is the thing they meant.
 */
function Matched({ text, query, className }: { text: string; query: string; className: string }) {
  const parts = splitMatch(text, query);
  return (
    <Text className={className} numberOfLines={1}>
      {parts ? (
        <>
          {parts.before}
          <Text className="font-bold text-text-primary">{parts.match}</Text>
          {parts.after}
        </>
      ) : (
        text
      )}
    </Text>
  );
}

/**
 * The wrapper carries the focus ring, so the input must not draw its own.
 * `outlineStyle` is a react-native-web style with no native counterpart.
 */
const NO_NATIVE_OUTLINE = { outlineStyle: "none" } as unknown as TextStyle;
