import { Text, View } from "react-native";

type Props = {
  label: string;
  value: string;
};

/**
 * One line of a specification: what it is on the left, what it is set to on
 * the right, closed by a hairline. Used wherever the app states the agreed
 * facts of a job — size, material, quantity, deadline.
 */
export function SpecRow({ label, value }: Props) {
  return (
    <View className="flex-row items-baseline justify-between gap-4 border-b border-outline-subtle py-3">
      {/* The label keeps its line; a long value (an address) wraps instead. */}
      <Text className="shrink-0 text-body text-text-secondary">{label}</Text>
      <Text className="shrink text-right text-body text-text-primary">{value}</Text>
    </View>
  );
}
