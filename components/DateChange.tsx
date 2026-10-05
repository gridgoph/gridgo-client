import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { readyByDate } from "@/lib/readyTime";
import { dateShiftLabel } from "@/lib/reschedule";

type Props = {
  /** The client promise being offered. */
  next: string;
  /** The promise it replaces, when the order has one. */
  previous?: string | null;
  label?: string;
};

/**
 * A ready date being moved, drawn the way a docket is corrected: the old date
 * struck through and the new one written under it, joined by a line so the
 * eye reads it as one date moving rather than two dates to compare.
 *
 * Both dates are the client's promise in Davao time (`readyByDate`), never a
 * shop's own deadline. The struck date is also said in words for a screen
 * reader, since a line through text is not announced.
 */
export function DateChange({ next, previous, label = "New ready date" }: Props) {
  const colors = useThemeColors();
  const nextText = readyByDate(next);
  const previousText = readyByDate(previous);
  const shift = dateShiftLabel(previous, next);
  if (!nextText) return null;

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${nextText}.${previousText ? ` It was ${previousText}.` : ""}${shift ? ` ${shift}.` : ""}`}
      className="gg-panel flex-row gap-3"
    >
      {previousText ? (
        <View className="items-center pt-1.5" style={{ width: 12 }}>
          <View
            className="rounded-pill border-2 border-outline bg-surface-variant"
            style={{ width: 10, height: 10 }}
          />
          <View className="flex-1 bg-outline" style={{ width: 2, minHeight: 28 }} />
          <View className="rounded-pill" style={{ width: 12, height: 12, backgroundColor: colors.textPrimary }} />
        </View>
      ) : null}
      <View className="min-w-0 flex-1 gap-3">
        {previousText ? (
          <View className="gap-0.5">
            <Text className="text-caption text-text-muted">Was</Text>
            <Text className="text-body text-text-muted line-through">{previousText}</Text>
          </View>
        ) : null}
        <View className="gap-0.5">
          <Text className="text-caption text-text-secondary">{label}</Text>
          <Text className="text-h3 font-bold text-text-primary">{nextText}</Text>
          {shift ? <Text className="text-caption text-text-secondary">{shift}</Text> : null}
        </View>
      </View>
    </View>
  );
}
