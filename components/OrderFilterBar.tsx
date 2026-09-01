import { ArrowDownUp, Check, Search, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View, type TextStyle } from "react-native";

import { Sheet } from "@/components/Sheet";
import { useThemeColors } from "@/hooks/useTheme";
import {
  ORDER_FILTERS,
  ORDER_SORTS,
  filterLabel,
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
};

/**
 * The three questions a client arrives at their orders with.
 *
 * What needs me, where is the flyers job, what have I not paid for. Search on
 * top because it is the one that answers itself; the filters below it because
 * they are the ones worth counting.
 *
 * The counts are the point of the chips. "Payment due 2" is a fact a client
 * wants before they tap, and it is the only decoration here that is really
 * information. Everything else stays in ink — this screen spends its yellow on
 * the job that needs paying, not on its own furniture.
 */
export function OrderFilterBar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  counts,
  sort,
  onSortChange,
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

      <View className="flex-row items-center gap-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pr-2"
          className="min-w-0 flex-1"
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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sort orders. Currently ${sortLabel(sort).toLowerCase()}`}
          onPress={() => setSorting(true)}
          className="gg-touch items-center justify-center rounded-field border border-outline px-3"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <ArrowDownUp size={18} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <Sheet open={sorting} onClose={() => setSorting(false)} title="Sort orders">
        <View className="gap-1 pb-2">
          {ORDER_SORTS.map((candidate) => (
            <Pressable
              key={candidate}
              accessibilityRole="button"
              accessibilityState={{ selected: candidate === sort }}
              accessibilityLabel={sortLabel(candidate)}
              onPress={() => {
                onSortChange(candidate);
                setSorting(false);
              }}
              className="gg-touch flex-row items-center justify-between gap-3 rounded-field px-3 py-3"
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
            >
              <Text className="text-body text-text-primary">{sortLabel(candidate)}</Text>
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
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
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
