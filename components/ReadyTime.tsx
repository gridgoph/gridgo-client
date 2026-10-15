import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { readyByDate, READY_TIME_EXPLANATION } from "@/lib/readyTime";

/**
 * Missing projections stay absent; a listing's press time is not a substitute.
 *
 * `early` is the order's `readyEarlyLabel`: printing already finished ahead of
 * time. It sits on the date it beat rather than replacing it, because the
 * promise still stands for delivery.
 */
export function ReadyTime({ promiseBy, early }: { promiseBy?: string | null; early?: string | null }) {
  const date = readyByDate(promiseBy);
  if (!date) return early ? <StatusChip tone="success" label={early} icon="clock-check" /> : null;
  return (
    <View className="gap-1">
      {early ? (
        <View className="flex-row">
          <StatusChip tone="success" label={early} icon="clock-check" />
        </View>
      ) : null}
      <Text className="text-body text-text-primary">Ready by {date}</Text>
      <Text className="text-caption text-text-muted">{READY_TIME_EXPLANATION}</Text>
    </View>
  );
}
