import { Check, ChevronDown, Search, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View, type TextStyle } from "react-native";

import { Sheet } from "@/components/Sheet";
import { useThemeColors } from "@/hooks/useTheme";
import {
  ORDER_FILTERS,
  ORDER_SORTS,
  filterLabel,
  sortBlurb,
  sortLabel,
  type OrderFilter,
  type OrderSort,
} from "@/lib/orderList";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  filter: OrderFilter;
  onFilterChange: (value: OrderFilter) => void;
  counts: Record<OrderFilter, number>;
  sort: OrderSort;
  onSortChange: (value: OrderSort) => void;
  /** How many jobs the list is actually showing, after filter and search. */
  shown: number;
};

/**
 * The three questions a client arrives at their orders with.
 *
 * What needs me, where is the flyers job, what have I not paid for. Each gets
 * its own line, because they were fighting: the chips and the sort shared a row
 * and the sort button sat on top of the last chip, so the row read as clipped
 * and the filters past it looked like the end of the list rather than the edge
 * of the screen.
 *
 * The chips now own their row edge to edge. A row that runs off the screen is
 * how a phone says "there is more this way", and it can only say it if nothing
 * is parked over the cut.
 *
 * The sort moved down to a line of its own and grew a label. It was an
 * unmarked pair of arrows, which is a control that can only be understood by
 * pressing it — and pressing it is exactly what a client will not do to
 * something they cannot name. Beside it sits the count of what is actually on
 * screen, which is the one fact the chips cannot give once a search narrows
 * them further.
 */
export function OrderFilterBar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  counts,
  sort,
  onSortChange,
  shown,
}: Props) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  const [sorting, setSorting] = useState(false);

  return (
    <View className="gap-3">
      <View
        className={
          focused
            ? "flex-row items-center gap-3 rounded-field border-2 border-accent bg-surface px-3"
            : "flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3"
        }
      >
        <Search
          size={18}
          color={colors.textMuted}
          strokeWidth={2}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <TextInput
          className="h-12 flex-1 text-body text-text-primary"
          style={NO_NATIVE_OUTLINE}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          value={query}
          onChangeText={onQueryChange}
          placeholder="Find a job"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Find a job by name or specification"
        />
        {query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => onQueryChange("")}
            className="gg-touch items-center justify-center"
          >
            <X size={18} color={colors.textSecondary} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      {/* Bled to the screen edge: the page's own 16px inset moves onto the
          scrolling content, so a chip that continues past the edge reads as
          more to come rather than as a chip somebody cut in half. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-4"
        contentContainerClassName="gap-2 px-4"
      >
        {ORDER_FILTERS.map((candidate) => (
          <FilterChip
            key={candidate}
            label={filterLabel(candidate)}
            count={counts[candidate] ?? 0}
            selected={candidate === filter}
            onPress={() => onFilterChange(candidate)}
          />
        ))}
      </ScrollView>

      <View className="flex-row items-center justify-between gap-3">
        <Text className="shrink text-caption text-text-muted" numberOfLines={1}>
          {shown === 1 ? "1 job" : `${shown} jobs`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${sortLabel(sort).toLowerCase()}. Change the order.`}
          onPress={() => setSorting(true)}
          className="gg-touch -mr-2 flex-row items-center gap-1 px-2"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-primary">{sortLabel(sort)}</Text>
          <ChevronDown
            size={16}
            color={colors.textPrimary}
            strokeWidth={2}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Pressable>
      </View>

      <Sheet open={sorting} onClose={() => setSorting(false)} title="Sort orders">
        <View className="gap-1 pb-2">
          {ORDER_SORTS.map((candidate) => (
            <Pressable
              key={candidate}
              accessibilityRole="button"
              accessibilityState={{ selected: candidate === sort }}
              accessibilityLabel={`${sortLabel(candidate)}. ${sortBlurb(candidate)}.`}
              onPress={() => {
                onSortChange(candidate);
                setSorting(false);
              }}
              className="gg-touch flex-row items-center justify-between gap-3 rounded-field px-3 py-3"
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
            >
              <View className="min-w-0 flex-1">
                <Text className="text-body text-text-primary">{sortLabel(candidate)}</Text>
                <Text className="mt-0.5 text-caption text-text-muted">
                  {sortBlurb(candidate)}
                </Text>
              </View>
              {candidate === sort ? (
                <Check size={18} color={colors.textPrimary} strokeWidth={2} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

/**
 * One filter, and how many jobs are behind it.
 *
 * The count is the reason to look before tapping, so it stays legible rather
 * than becoming a badge. A filter with nothing behind it is dimmed and still
 * pressable: hiding it would make the row's contents shift under the thumb
 * every time a job changed state.
 */
function FilterChip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  const empty = count === 0 && !selected;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${count} ${count === 1 ? "job" : "jobs"}`}
      onPress={onPress}
      className={
        selected
          ? "h-9 flex-row items-center gap-2 rounded-pill border border-accent bg-surface-high px-3"
          : "h-9 flex-row items-center gap-2 rounded-pill border border-outline bg-surface px-3"
      }
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : empty ? 0.45 : 1 })}
    >
      <Text
        className={
          selected
            ? "text-button text-text-primary"
            : "text-button font-normal text-text-secondary"
        }
      >
        {label}
      </Text>
      <Text
        className={selected ? "text-caption text-text-secondary" : "text-caption text-text-muted"}
      >
        {count}
      </Text>
    </Pressable>
  );
}

/** RN Web draws its own focus ring; the field already has one. */
const NO_NATIVE_OUTLINE = { outline: "none" } as unknown as TextStyle;
