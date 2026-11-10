import { Rocket, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { PLAY_OPTIN_COPY } from "@/lib/playOptin";

/**
 * Home's Play closed-test ask: the tester card's shape, one icon, a few words.
 * The row opens the steps; the cross closes it for this session (GRIDGO stops
 * asking after the third). No yellow: Home's one yellow is the "+".
 */
export function PlayOptinCard({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  const colors = useThemeColors();
  return (
    <View className="gg-card-flush flex-row items-center">
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={PLAY_OPTIN_COPY}
        className="min-w-0 flex-1 flex-row items-center gap-3 py-3 pl-4"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <View className="items-center justify-center rounded-pill bg-accent" style={{ width: 36, height: 36 }}>
          <Rocket size={18} color={colors.accentOn} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-body font-bold text-text-primary">Become a tester</Text>
          <Text className="text-caption text-text-secondary" numberOfLines={1}>
            Help us launch GRIDGO on Play
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Not now"
        className="gg-touch items-center justify-center"
        style={({ pressed }) => ({ width: 44, height: 44, marginRight: 4, opacity: pressed ? 0.6 : 1 })}
      >
        <X size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
