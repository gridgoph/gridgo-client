import { Text, View } from "react-native";

import { readyByDate, READY_TIME_EXPLANATION } from "@/lib/readyTime";

/** Missing projections stay absent; a listing's press time is not a substitute. */
export function ReadyTime({ promiseBy }: { promiseBy?: string | null }) {
  const date = readyByDate(promiseBy);
  if (!date) return null;
  return (
    <View className="gap-1">
      <Text className="text-body text-text-primary">Ready by {date}</Text>
      <Text className="text-caption text-text-muted">{READY_TIME_EXPLANATION}</Text>
    </View>
  );
}
