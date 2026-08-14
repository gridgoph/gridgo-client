import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

export function GoogleButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      onPress={onPress}
      disabled={disabled}
      className={disabled ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
    >
      {({ pressed }) => (
        <>
          <View className="flex-row items-center justify-center gap-3">
            <MaterialCommunityIcons name="google" size={20} color={colors.textPrimary} />
            <Text className="text-button text-text-primary">Continue with Google</Text>
          </View>
          {pressed ? (
            <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-field" />
          ) : null}
        </>
      )}
    </Pressable>
  );
}
