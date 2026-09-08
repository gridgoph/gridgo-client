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

/** The glyph, and the plate that sits on its corner. */
const GLYPH = 22;
const BADGE = 19;
const RING = 2;

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
 * disc.
 *
 * **The plate is lifted to the corner, not parked on the shoulder.** Lucide's
 * `ShoppingBag` carries ink to the full width of its box, so the flap and the
 * right wall are exactly where a badge lands. It shipped at 16 outer with a
 * 2px ring pinned at -5/-6: that left **12px of ink** for a 10px numeral, so
 * the digit had no optical padding and read as a scratch, while the disc sat
 * low enough to bite the flap and the ring looked like a notch cut out of the
 * bag rather than a plate laid over it.
 *
 * Both halves are geometry, and both were checked against renders rather than
 * reasoned about. Growing the disc alone makes it worse — at 21 outer it eats
 * the flap and the glyph stops being a bag. What works is a modest step up in
 * size plus a push *outward*: 19/15 with a 12px numeral (the type scale's own
 * floor, and the 0.8 numeral-to-ink proportion that leaves a digit air on
 * every side) at -8/-9, where the plate covers the bag's corner and leaves the
 * flap and the top rail legible underneath. That still clears the 44×44 hit
 * target by 2px on the right and 3px at the top, so nothing clips, and "9+"
 * grows leftward from a fixed right edge.
 *
 * Figures are tabular so 1, 3 and 9+ occupy one width and the plate does not
 * twitch as the basket changes. Colour and type go through `style` because
 * NativeWind on a small overlay dropped `text-accent-on` and left a white
 * numeral on a white circle.
 */
export function HeaderIconButton({ icon: Icon, accessibilityLabel, onPress, count }: Props) {
  const colors = useThemeColors();
  const badge = count ?? 0;
  const wide = badge > 9;
  const label = wide ? "9+" : String(badge);

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
          <View style={{ width: GLYPH, height: GLYPH }}>
            <Icon
              size={GLYPH}
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
                  top: -8,
                  right: -9,
                  minWidth: BADGE,
                  height: BADGE,
                  paddingHorizontal: wide ? 3 : 0,
                  borderRadius: BADGE / 2,
                  backgroundColor: colors.accent,
                  borderWidth: RING,
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
                    fontSize: 12,
                    lineHeight: 12,
                    letterSpacing: -0.2,
                    includeFontPadding: false,
                    textAlign: "center",
                    fontVariant: ["tabular-nums"],
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
