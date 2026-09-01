import {
  MapPin,
  Printer,
  ShoppingBag,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import {
  stagesForRail,
  type FulfilmentRailKind,
  type OrderStageKey,
} from "@/lib/orderStages";

const ICONS: Record<OrderStageKey, LucideIcon> = {
  order: ShoppingBag,
  printing: Printer,
  dispatch: Truck,
  delivered: MapPin,
  to_office: Truck,
  counter: Store,
};

type Props = {
  /** Index into the rail for `kind`. Nothing renders for null. */
  currentIndex: number | null;
  /** Collect jobs use Counter, not Delivered. */
  kind?: FulfilmentRailKind;
};

/**
 * Where a job has got to — delivery (Order · Printing · Dispatch · Delivered)
 * or collect (Order · Printing · To office · Counter).
 *
 * Carried over from the legacy GRIDGO notification, which is where the idea
 * earns its place — a notification that shows the job's position tells you
 * whether it needs you without opening anything.
 *
 * Two things about it are deliberately not the legacy version's. It is
 * monochrome: the legacy rail filled its reached dots with brand yellow, and a
 * list of ten notifications would then carry ten yellow elements against a
 * design system that spends yellow once per screen. And it does not lean on
 * colour at all — a reached stage is a filled disc with an inked label, an
 * unreached one is an outline with a muted label, so the rail reads the same
 * in greyscale as in colour.
 */
export function OrderStageRail({ currentIndex, kind = "delivery" }: Props) {
  const colors = useThemeColors();
  const stages = stagesForRail(kind);
  if (currentIndex == null) return null;
  const current = stages[currentIndex];
  if (!current) return null;

  return (
    <View
      className="flex-row"
      accessibilityRole="progressbar"
      accessibilityLabel={`Stage ${currentIndex + 1} of ${stages.length}: ${current.label}`}
    >
      {stages.map((stage, index) => {
        const reached = index <= currentIndex;
        const current = index === currentIndex;
        const Icon = ICONS[stage.key];

        return (
          <View key={stage.key} className="flex-1 items-center gap-2">
            {/* The connector sits behind the disc row and stops at the ends,
                so the rail never trails off past the first or last stage. */}
            <View className="h-8 w-full items-center justify-center">
              {index > 0 ? (
                <View
                  className={
                    reached
                      ? "absolute left-0 right-1/2 h-0.5 bg-accent"
                      : "absolute left-0 right-1/2 h-0.5 bg-outline"
                  }
                />
              ) : null}
              {index < stages.length - 1 ? (
                <View
                  className={
                    index < currentIndex
                      ? "absolute left-1/2 right-0 h-0.5 bg-accent"
                      : "absolute left-1/2 right-0 h-0.5 bg-outline"
                  }
                />
              ) : null}
              <View
                className={
                  reached
                    ? "h-8 w-8 items-center justify-center rounded-pill bg-accent"
                    : "h-8 w-8 items-center justify-center rounded-pill border border-outline bg-surface"
                }
              >
                <Icon
                  size={16}
                  strokeWidth={2}
                  color={reached ? colors.accentOn : colors.textMuted}
                />
              </View>
            </View>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              className={
                current
                  ? "text-caption font-medium text-text-primary"
                  : reached
                    ? "text-caption text-text-secondary"
                    : "text-caption text-text-muted"
              }
            >
              {stage.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
