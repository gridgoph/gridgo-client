import type { LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { fontFamily } from "@/constants/fonts";
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
 * a count to show — ink on the inverted accent, never yellow (Home's yellow
 * is the tab bar's "+" one row below).
 *
 * The count sits on the glyph, not on the 44×44 hit target: a badge pinned to
 * the pressable floats in the corner of empty padding and reads as a stray
 * disc. A 2px canvas ring keeps the disc from melting into the bag's stroke.
 * Colour and type go through `style` because NativeWind on a 16px overlay
 * dropped `text-accent-on` and left a white numeral on a white circle.
 */
export function HeaderIconButton({ icon: Icon, accessibilityLabel, onPress, count }: Props) {
  const colors = useThemeColors();
  const badge = count ?? 0;
  const label = badge > 9 ? "9+" : String(badge);

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
          <View>
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
                style={{
                  position: "absolute",
                  top: -5,
                  right: -6,
                  minWidth: 16,
                  height: 16,
                  paddingHorizontal: badge > 9 ? 4 : 0,
                  borderRadius: 8,
                  backgroundColor: colors.accent,
                  borderWidth: 2,
                  borderColor: colors.canvas,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.accentOn,
                    fontFamily: fontFamily.bold,
                    fontSize: 10,
                    lineHeight: 12,
                    includeFontPadding: false,
                    textAlign: "center",
                  }}
                >
                  {label}
                </Text>
              </View>
            ) : null}
          </View>
        </>
      )}
    </Pressable>
  );
}
