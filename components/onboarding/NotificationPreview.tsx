import { BellRing, FileCheck2, Lock, Truck, Wallet, type LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";

import { GridgoMark } from "@/components/GridgoLogo";
import { useThemeColors } from "@/hooks/useTheme";
import { PUSH_EXPLAINER_COPY, type PushExplainerIcon } from "@/lib/push";

const ICONS = {
  artwork: FileCheck2,
  payment: Wallet,
  delivery: Truck,
  reminder: BellRing,
} satisfies Record<PushExplainerIcon, LucideIcon>;

/**
 * Onboarding's notification picture: the notification itself, then when it comes.
 *
 * The card is not a mock-up of something nicer than what arrives. Every order
 * push the server sends reads exactly "GRIDGO update / Open GRIDGO for the
 * latest update" (`lib/push.ts`), so that is what is drawn — the privacy line
 * under the moments is the reason, said once.
 *
 * The moments are the explainer sheet's own list (`PUSH_EXPLAINER_COPY`), so
 * the page and the sheet can never promise different things.
 */
export function NotificationPreview() {
  const colors = useThemeColors();

  return (
    <View className="min-h-0 flex-1 justify-center gap-4 px-6">
      <View
        className="gg-card flex-row items-start gap-3"
        accessible
        accessibilityLabel="A GRIDGO notification reads: GRIDGO update. Open GRIDGO for the latest update."
      >
        <View className="h-10 w-10 items-center justify-center rounded-field border border-outline bg-surface-variant">
          <GridgoMark size={22} />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-baseline justify-between gap-2">
            <Text className="text-body font-bold text-text-primary">GRIDGO update</Text>
            <Text className="text-caption text-text-muted">now</Text>
          </View>
          <Text className="text-body text-text-secondary">Open GRIDGO for the latest update.</Text>
        </View>
      </View>

      <View
        className="gap-2.5 px-1"
        accessible
        accessibilityLabel={`You will hear when: ${PUSH_EXPLAINER_COPY.points
          .map((point) => point.text)
          .join("; ")}.`}
      >
        {PUSH_EXPLAINER_COPY.points.map((point) => {
          const Icon = ICONS[point.icon];
          return (
            <View key={point.icon} className="flex-row items-center gap-3">
              <View className="h-7 w-7 items-center justify-center rounded-pill bg-surface-variant">
                <Icon size={15} color={colors.textPrimary} strokeWidth={2} aria-hidden />
              </View>
              <Text className="min-w-0 flex-1 text-body text-text-primary">{point.text}</Text>
            </View>
          );
        })}
      </View>

      <View className="flex-row items-start gap-2 px-1">
        <Lock size={14} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 1 }} aria-hidden />
        <Text className="min-w-0 flex-1 text-caption text-text-muted">
          {PUSH_EXPLAINER_COPY.privacy}
        </Text>
      </View>
    </View>
  );
}
