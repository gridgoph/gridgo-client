import { Text, View } from "react-native";

export function AuthDivider() {
  return (
    <View className="flex-row items-center gap-3" accessibilityElementsHidden>
      <View className="h-px flex-1 bg-outline-subtle" />
      <Text className="text-caption text-text-muted">or continue with</Text>
      <View className="h-px flex-1 bg-outline-subtle" />
    </View>
  );
}
