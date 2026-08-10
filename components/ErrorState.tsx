import { Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";

type Props = {
  /** What did not happen, in three or four words. Never a code. */
  label: string;
  /** What went wrong and what to do about it. Already plain language. */
  body: string;
  retryLabel?: string;
  onRetry?: () => void;
};

/**
 * A request that did not land.
 *
 * The chip carries icon, label and colour so the failure survives greyscale;
 * the body says the fix. Error codes and internal state names are mapped in
 * `lib/copy.ts` long before they reach here.
 */
export function ErrorState({ label, body, retryLabel = "Try again", onRetry }: Props) {
  return (
    <View className="gg-card gap-3">
      <StatusChip tone="error" label={label} icon="circle-x" />
      <Text className="text-body text-text-primary">{body}</Text>
      {onRetry ? <SecondaryButton label={retryLabel} onPress={onRetry} /> : null}
    </View>
  );
}

/** The same failure, as the whole screen, when nothing else could render. */
export function ErrorScreenState({ label, body, retryLabel, onRetry }: Props) {
  return (
    <View className="gg-page gap-4 pt-6">
      <ErrorState label={label} body={body} retryLabel={retryLabel} onRetry={onRetry} />
    </View>
  );
}
