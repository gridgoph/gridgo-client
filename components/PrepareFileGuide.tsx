import { Droplets, Grid3x3 } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { GuideRow } from "@/lib/artworkGuidance";

const ICONS = { colour: Droplets, resolution: Grid3x3 } as const;

/**
 * "Prepare your file": what this product type wants, before anything is
 * uploaded. The targets are GRIDGO's, per product type, so the guide follows
 * Super Admin's edits without a release. Advice, never a rule — a file that
 * misses either still goes through, with a warning to accept or fix.
 */
export function PrepareFileGuide({ rows }: { rows: GuideRow[] }) {
  const colors = useThemeColors();
  return (
    <View className="gg-card gap-3">
      <Text className="text-h3 text-text-primary">Prepare your file</Text>
      {rows.map((row) => {
        const Icon = ICONS[row.id];
        return (
          <View
            key={row.id}
            className="flex-row items-start gap-3"
            accessible
            accessibilityLabel={`${row.title}. ${row.body}`}
          >
            <View aria-hidden className="h-8 w-8 items-center justify-center rounded-field bg-surface-variant">
              <Icon size={16} color={colors.textPrimary} strokeWidth={2} />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-body font-medium text-text-primary">{row.title}</Text>
              <Text className="text-caption text-text-secondary">{row.body}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
