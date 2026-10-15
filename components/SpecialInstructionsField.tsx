import { Text, View } from "react-native";

import { TextField } from "@/components/form/TextField";
import {
  NOTE_HELP,
  NOTE_PRICE_HINT,
  specialInstructionsCount,
  specialInstructionsProblem,
} from "@/lib/orderChanges";

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

/**
 * One open box under an item's spec choices (report F9FCD485): what the fixed
 * options cannot say — names on each shirt size, darker lines, a staple on the
 * left. Optional, one per item, and never a price change; that is said beside
 * the box rather than discovered later.
 *
 * No `maxLength`: a pasted note longer than the limit would be cut silently.
 * The count turns to an error instead, and saving waits until it fits.
 */
export function SpecialInstructionsField({ value, onChange, disabled }: Props) {
  const problem = specialInstructionsProblem(value);
  const over = problem != null;
  return (
    <View className="gap-2" testID="special-instructions">
      <View className="flex-row items-baseline gap-2">
        <Text className="text-body font-medium text-text-primary">Special instructions</Text>
        <Text className="text-caption text-text-muted">Optional</Text>
      </View>
      <TextField
        value={value}
        onChangeText={onChange}
        multiline
        multilineMinHeight={104}
        editable={disabled ? false : undefined}
        accessibilityLabel="Special instructions for this item"
        placeholder="For example: names to print on each shirt size, or a staple on the left"
      />
      <View className="flex-row items-start justify-between gap-3">
        <Text className={over ? "min-w-0 flex-1 text-caption text-error" : "min-w-0 flex-1 text-caption font-medium text-text-secondary"}>
          {problem ?? NOTE_PRICE_HINT}
        </Text>
        <Text
          className={over ? "text-caption font-medium text-error" : "text-caption text-text-muted"}
          accessibilityLabel={`${specialInstructionsCount(value)} characters`}
        >
          {specialInstructionsCount(value)}
        </Text>
      </View>
      <Text className="text-caption text-text-muted">{NOTE_HELP}</Text>
    </View>
  );
}
