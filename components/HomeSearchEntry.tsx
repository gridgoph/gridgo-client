import { Search } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  onPress: () => void;
};

/**
 * The fast way in for a client who already knows what they want.
 *
 * Home's start menu is five categories, and a person who came to order a
 * tarpaulin should not have to work out which family a tarpaulin belongs to.
 * `app/request/category.tsx` already searches names *and* examples — "tote
 * bag" and "x-stand" are what people type, and neither is a subcategory name —
 * so this is a way into that search, not a second copy of it. A real input
 * here would mean two search states to keep in step and a keyboard opening on
 * a screen that has nothing to submit.
 *
 * It is a button, and it says so to a screen reader. It is also ink, not
 * yellow: the floating "+" is still the screen's one primary action, and this
 * lands in the same picker one step further along.
 */
export function HomeSearchEntry({ onPress }: Props) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Search what GRIDGO prints"
      className="h-12 flex-row items-center gap-3 rounded-field border border-outline bg-surface px-4"
    >
      {({ pressed }) => (
        <>
          <Search size={18} color={colors.textMuted} strokeWidth={2} />
          <Text className="flex-1 text-body text-text-muted" numberOfLines={1}>
            What are you printing?
          </Text>
          {pressed ? (
            <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-field" />
          ) : null}
        </>
      )}
    </Pressable>
  );
}
