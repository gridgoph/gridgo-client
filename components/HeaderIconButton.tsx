import type { LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  icon: LucideIcon;
  /** The control's whole name — the glyph is decorative and hidden from AT. */
  accessibilityLabel: string;
  onPress: () => void;
  /** Optional tally. Omit it entirely rather than passing 0 for "no count". */
  count?: number;
};

/**
 * One 44×44 control in a screen's header row.
 *
 * Cart and Chat sit side by side, so their geometry is shared rather than
 * described twice: the same hit target, the same 22pt glyph, the same badge.
 * They are glyphs on the canvas — no outlined box — because a second filled
 * chip next to the GRIDGO mark reads as chrome fighting the identity, and
 * the tab bar's "+" is already the one yellow object in a thumb's reach.
 *
 * Monochrome, always. The badge is the only colour, and only when there is
 * a count to show.
 */
export function HeaderIconButton({ icon: Icon, accessibilityLabel, onPress, count }: Props) {
  const colors = useThemeColors();
  const badge = count ?? 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="h-11 w-11 items-center justify-center"
    >
      {({ pressed }) => (
        <>
          {pressed ? (
            <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-full" />
          ) : null}
          <Icon
            size={22}
            color={colors.textPrimary}
            strokeWidth={1.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          {badge > 0 ? (
            <View
              pointerEvents="none"
              className="absolute right-0.5 top-0.5 h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-0.5"
            >
              <Text className="text-caption font-medium text-accent-on" numberOfLines={1}>
                {badge > 9 ? "9+" : badge}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}
