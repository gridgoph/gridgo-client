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
 * Cart and Chat sit side by side at the top of Home, so their geometry is
 * shared rather than described twice: the same touch target, the same hairline
 * shell, the same 18pt glyph and the same badge. Two controls a thumb's width
 * apart are read as a pair, and a pair that disagrees by two points looks
 * broken long before anyone can say why.
 *
 * Monochrome, always. Home's yellow is the tab bar's "+" one row below this,
 * and a second yellow thing in the same thumb's reach is how a screen stops
 * having a primary action. That includes the badge.
 */
export function HeaderIconButton({ icon: Icon, accessibilityLabel, onPress, count }: Props) {
  const colors = useThemeColors();
  const badge = count ?? 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="gg-btn-secondary h-11 w-11 px-0"
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
    >
      <Icon
        size={18}
        color={colors.textPrimary}
        strokeWidth={2}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      {badge > 0 ? (
        <View
          pointerEvents="none"
          className="absolute -right-1.5 -top-1.5 h-5 min-w-5 items-center justify-center rounded-pill border border-surface bg-accent px-1"
        >
          <Text className="text-caption text-accent-on" numberOfLines={1}>
            {badge > 9 ? "9+" : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
