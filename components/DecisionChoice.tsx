import { Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";

type Props = {
  label: string;
  /** What happens next if they choose this, said before they do. */
  note: string;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/**
 * One answer to a decision, with its consequence written right under it, so
 * a client reads what each button does without opening anything.
 */
export function DecisionChoice({ label, note, primary, disabled, onPress }: Props) {
  return (
    <View className="gap-2">
      {primary ? (
        <PrimaryButton label={label} disabled={disabled} onPress={onPress} />
      ) : (
        <SecondaryButton label={label} disabled={disabled} onPress={onPress} />
      )}
      <Text className="px-1 text-caption text-text-muted">{note}</Text>
    </View>
  );
}
