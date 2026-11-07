import { FileX, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

/**
 * Home's one-time word that a request saved on the retired form was cleared.
 *
 * In the quiet register of the season notice beside it, and it names no job: a
 * phone can change hands, and the sentence is true without saying what it was.
 */
export function RetiredDraftNotice({ onDismiss }: { onDismiss: () => void }) {
  const colors = useThemeColors();
  return (
    <View className="gg-card-flush flex-row gap-3 py-4 pl-4 pr-1">
      <View className="items-center justify-center rounded-pill bg-surface-variant" style={{ width: 40, height: 40 }}>
        <FileX size={20} color={colors.textPrimary} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 pt-0.5">
        <Text className="text-body-lg font-bold text-text-primary">Your saved request was cleared</Text>
        <Text className="mt-1 text-body text-text-secondary">
          Ordering has changed. Tap + to start a new print or reorder a past job.
        </Text>
      </View>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss the saved request notice"
        hitSlop={4}
        className="gg-touch items-center justify-center"
        style={({ pressed }) => ({ width: 44, height: 44, opacity: pressed ? 0.6 : 1 })}
      >
        <X size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
