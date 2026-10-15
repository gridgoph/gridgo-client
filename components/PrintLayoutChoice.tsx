import { Check, Info } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { useThemeColors } from "@/hooks/useTheme";
import type { PrintLayoutCode } from "@/lib/api";
import { layoutHint, layoutLabel, type KnownLayout } from "@/lib/printLayout";

type Props = {
  layouts: KnownLayout[];
  selected: PrintLayoutCode | null;
  onSelect: (layout: KnownLayout) => void;
  /** Step number on the listing; null where it is not one of the numbered steps. */
  step: number | null;
  disabled?: boolean;
  /** Under Fit to paper once it is picked: the drawing scale changes. */
  scaleNote?: string | null;
};

/**
 * How the file sits on the paper (gridgo-client#245).
 *
 * Drawn as one more step of the shop's order sheet, with the same circle a
 * required answer gets, because that is what it is: the shop needs it before
 * it can print a drawing at the right scale. Nothing is ticked until the
 * client ticks it.
 *
 * Each row carries a small picture of its own placement — the page filling
 * the paper, sitting in its middle, or starting from its corner. The words
 * say the same thing, so the picture is never the only way to tell them apart.
 */
export function PrintLayoutChoice({ layouts, selected, onSelect, step, disabled = false, scaleNote }: Props) {
  const colors = useThemeColors();
  const heading = step != null ? `STEP ${step} · LAYOUT` : "LAYOUT";
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-overline text-text-muted">{heading}</Text>
        <View className="rounded-pill border border-outline px-2 py-0.5">
          <Text className="text-caption text-text-secondary">Pick 1</Text>
        </View>
      </View>
      <Text className="text-caption text-text-muted">How your file sits on the paper.</Text>
      <View className="gg-card-flush" accessibilityRole="radiogroup" accessibilityLabel="Layout">
        {layouts.map((layout, index) => {
          const chosen = layout === selected;
          return (
            <View key={layout} className={index === 0 ? undefined : "border-t border-outline-subtle"}>
              <Pressable
                onPress={() => onSelect(layout)}
                disabled={disabled}
                accessibilityRole="radio"
                accessibilityState={{ checked: chosen, disabled }}
                accessibilityLabel={`${layoutLabel(layout)}. ${layoutHint(layout)}`}
                className="gg-touch flex-row items-center gap-3 px-4 py-3"
              >
                {({ pressed }) => (
                  <>
                    <Marker selected={chosen} />
                    <LayoutGlyph layout={layout} selected={chosen} />
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="text-body text-text-primary">{layoutLabel(layout)}</Text>
                      <Text className="text-caption text-text-muted">{layoutHint(layout)}</Text>
                    </View>
                    {pressed && !disabled ? (
                      <View pointerEvents="none" className="gg-pressed absolute inset-0" />
                    ) : null}
                  </>
                )}
              </Pressable>
              {chosen && layout === "fit_to_paper" && scaleNote ? (
                <View
                  className="flex-row items-start gap-2 px-4 pb-3"
                  accessible
                  accessibilityLiveRegion="polite"
                  accessibilityLabel={scaleNote}
                >
                  <View className="pt-0.5">
                    <Info size={14} color={colors.info} strokeWidth={2} aria-hidden />
                  </View>
                  <Text className="min-w-0 flex-1 text-caption text-text-secondary">{scaleNote}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Marker({ selected }: { selected: boolean }) {
  const colors = useThemeColors();
  if (!selected) {
    return <View className="h-[18px] w-[18px] rounded-pill border border-outline" aria-hidden />;
  }
  return (
    <View className="h-[18px] w-[18px] items-center justify-center rounded-pill border border-accent bg-accent" aria-hidden>
      <Check size={12} color={colors.accentOn} strokeWidth={3} />
    </View>
  );
}

/**
 * The placement in miniature: a sheet of paper and the page on it. Fit fills
 * the sheet; the two actual-size layouts keep a smaller page in the middle or
 * at the top-left corner.
 */
function LayoutGlyph({ layout, selected }: { layout: KnownLayout; selected: boolean }) {
  const colors = useThemeColors();
  const ink = selected ? colors.textPrimary : colors.textMuted;
  const page =
    layout === "fit_to_paper"
      ? { x: 3, y: 3, width: 18, height: 26 }
      : layout === "actual_size_centered"
        ? { x: 6, y: 9, width: 12, height: 14 }
        : { x: 1.5, y: 1.5, width: 12, height: 14 };
  return (
    <Svg width={24} height={32} viewBox="0 0 24 32" aria-hidden>
      <Rect x={0.75} y={0.75} width={22.5} height={30.5} rx={1.5} fill={colors.surface} stroke={ink} strokeWidth={1.5} />
      <Rect {...page} rx={0.5} fill={ink} opacity={selected ? 0.85 : 0.45} />
    </Svg>
  );
}
