import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { DeliveryChoice } from "@/lib/basketGroups";

type Props = {
  /** Null where splitting would change nothing; then only the date line, if any, is drawn. */
  choice: DeliveryChoice | null;
  /** "Delivered together by Fri 12 Oct, the earliest date here." — null when the items share a date. */
  dateLine: string | null;
  busy: boolean;
  /** GRIDGO's refusal of the last choice on this shop, in plain words. */
  error: string | null;
  onChoose: (split: DeliveryChoice["split"]) => void;
};

/**
 * One shop's products travel together by their earliest date unless the
 * client ticks "Deliver separately" (gridgo-api#275): then each date is a
 * delivery of its own, with its own fee, shown in the money rows before
 * paying. The same tick as "Also make this my usual order" — ink, never
 * yellow, because the screen's one primary action is placing the order.
 */
export function DeliverSeparatelyChoice({ choice, dateLine, busy, error, onChoose }: Props) {
  const colors = useThemeColors();
  if (!choice && !dateLine && !error) return null;
  const checked = choice?.separate ?? false;
  return (
    <View className="gap-2">
      {dateLine ? <Text className="text-caption text-text-secondary">{dateLine}</Text> : null}
      {choice ? (
        <Pressable
          onPress={() => onChoose(choice.split)}
          disabled={busy}
          accessibilityRole="checkbox"
          accessibilityState={{ checked, disabled: busy }}
          accessibilityLabel="Deliver separately"
          accessibilityHint={choice.note}
          testID="deliver-separately"
          className="gg-touch flex-row items-start gap-3 py-1"
          style={({ pressed }) => (pressed && !busy ? { opacity: 0.7 } : undefined)}
        >
          <View
            className={
              checked
                ? "mt-0.5 h-6 w-6 items-center justify-center rounded-sm bg-accent"
                : "mt-0.5 h-6 w-6 items-center justify-center rounded-sm border border-outline bg-surface"
            }
            aria-hidden
          >
            {checked ? <Check size={16} color={colors.accentOn} strokeWidth={2.5} aria-hidden /> : null}
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-body font-medium text-text-primary">Deliver separately</Text>
            <Text className="text-caption text-text-muted">{choice.note}</Text>
          </View>
        </Pressable>
      ) : null}
      {error ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
