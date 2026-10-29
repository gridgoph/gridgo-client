import { Text, View } from "react-native";

import type { SavedFilesUsage } from "@/lib/api";
import { usageFraction, usageLine, usageNearlyFull, usageRoomLine } from "@/lib/myFiles";

/**
 * How much of My files is used, as a figure and as one ink bar.
 *
 * The figure is the point and leads; the bar only lets it be read at a glance.
 * Nearly full turns the bar to the warning colour, and the line under it says
 * the same in words, so colour never carries it alone.
 */
export function MyFilesUsage({ usage }: { usage: SavedFilesUsage }) {
  const fraction = usageFraction(usage);
  const warn = usageNearlyFull(usage);
  return (
    <View
      className="gg-card gap-3"
      accessible
      accessibilityLabel={`Storage. ${usageLine(usage)}. ${usageRoomLine(usage)}`}
    >
      <View className="gap-0.5">
        <Text className="text-caption text-text-muted">Storage</Text>
        <Text className="text-h3 text-text-primary">{usageLine(usage)}</Text>
      </View>
      <View className="h-2 w-full overflow-hidden rounded-pill bg-surface-variant" aria-hidden>
        <View
          className={warn ? "h-full rounded-pill bg-warning" : "h-full rounded-pill bg-accent"}
          // A sliver stays visible once anything is saved, so "used" never reads as empty.
          style={{ width: `${fraction > 0 ? Math.max(fraction * 100, 2) : 0}%` }}
        />
      </View>
      <Text className={warn ? "text-caption text-text-secondary" : "text-caption text-text-muted"}>
        {usageRoomLine(usage)}
      </Text>
    </View>
  );
}
