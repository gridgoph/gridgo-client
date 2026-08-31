import { Search, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View, type TextStyle } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** What the field is hunting inside, for the accessibility name. */
  categoryName: string;
};

/**
 * Find a sample on this category's wall.
 *
 * Same charcoal field as the shop's board — a client picking by looking uses
 * the same hunt shape the shop does. No debounce: the filter is on the phone.
 */
export function CategoryHuntField({ value, onChange, categoryName }: Props) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);

  return (
    <View
      className={
        focused
          ? "flex-row items-center gap-3 rounded-field border-2 border-accent bg-surface px-3"
          : "flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3"
      }
    >
      <Search size={18} color={colors.textMuted} strokeWidth={2} />
      <TextInput
        className="h-12 flex-1 text-body text-text-primary"
        style={NO_NATIVE_OUTLINE}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        value={value}
        onChangeText={onChange}
        placeholder="Find a sample"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={`Find a sample in ${categoryName}`}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChange("")}
          className="gg-touch items-center justify-center"
        >
          <X size={18} color={colors.textSecondary} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const NO_NATIVE_OUTLINE = { outlineStyle: "none" } as unknown as TextStyle;
