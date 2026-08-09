import { Minus, Plus } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { clampQuantity, describeQuantity, quantityBounds } from "@/lib/quantity";

type Props = {
  value: number;
  unit: string;
  onChange: (value: number) => void;
};

/**
 * Quantity, with the bounds the unit actually has.
 *
 * A bare number keypad lets a client type 100000 flyers and only find out at
 * validation. The stepper shows the reachable range and says what a number
 * means — four packs of 100, not four.
 */
export function QuantityStepper({ value, unit, onChange }: Props) {
  const colors = useThemeColors();
  const bounds = quantityBounds(unit);
  const atMin = value <= bounds.min;
  const atMax = value >= bounds.max;

  const step = (direction: 1 | -1) => {
    onChange(clampQuantity(value + direction * bounds.step, unit));
  };

  return (
    <View className="gap-2">
      <View className="h-12 flex-row items-center justify-between rounded-field border border-outline bg-surface px-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decrease quantity"
          accessibilityState={{ disabled: atMin }}
          disabled={atMin}
          onPress={() => step(-1)}
          className={atMin ? "gg-touch gg-disabled items-center justify-center" : "gg-touch items-center justify-center"}
        >
          <Minus size={20} color={colors.textPrimary} strokeWidth={2.5} />
        </Pressable>

        <View className="flex-1 items-center">
          <Text
            className="text-h3 text-text-primary"
            accessibilityLabel={describeQuantity(value, unit)}
          >
            {value}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Increase quantity"
          accessibilityState={{ disabled: atMax }}
          disabled={atMax}
          onPress={() => step(1)}
          className={atMax ? "gg-touch gg-disabled items-center justify-center" : "gg-touch items-center justify-center"}
        >
          <Plus size={20} color={colors.textPrimary} strokeWidth={2.5} />
        </Pressable>
      </View>

      <Text className="text-caption text-text-muted">
        {describeQuantity(value, unit)}
        {atMax ? ` · ${bounds.max} is the most one request covers` : ""}
      </Text>
    </View>
  );
}
