import { Stack, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Text } from "react-native";

import { Pressable } from "@/components/Pressable";
import { useThemeColors } from "@/hooks/useTheme";

/** A way Home for a screen a link opened with nothing behind it. */
export function HomeEscape() {
  const router = useRouter();
  const colors = useThemeColors();
  if (router.canGoBack()) return null;
  return (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <Pressable
            onPress={() => router.replace("/(tabs)/home")}
            accessibilityRole="button"
            accessibilityLabel="Back to Home"
            hitSlop={12}
            className="flex-row items-center gap-1 pr-3"
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
            <Text className="text-body-lg text-text-primary">Home</Text>
          </Pressable>
        ),
      }}
    />
  );
}
