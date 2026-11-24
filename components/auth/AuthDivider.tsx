import { Text, View } from "react-native";

export function AuthDivider({ label = "or continue with" }: { label?: string }) {
  return (
    <View className="flex-row items-center gap-3" aria-hidden>
      <View className="h-px flex-1 bg-outline-subtle" />
      <Text className="text-caption text-text-muted">{label}</Text>
      <View className="h-px flex-1 bg-outline-subtle" />
    </View>
  );
}
