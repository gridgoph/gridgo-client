import { ChevronLeft } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

export function AuthBackButton({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={onPress}
      className="gg-touch h-11 w-11 items-center justify-center rounded-pill border border-outline bg-surface"
    >
      {({ pressed }) => (
        <View className={pressed ? "opacity-60" : undefined}>
          <ChevronLeft size={22} color={colors.textPrimary} strokeWidth={2.2} />
        </View>
      )}
    </Pressable>
  );
}
