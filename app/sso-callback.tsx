import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Clerk's default browser-SSO redirect target.
 *
 * `startSSOFlow` owns the callback data and session activation. This route only
 * gives Expo Go's deep link a real screen, then returns to login while the
 * root Clerk bridge resolves the client profile or shows a role error there.
 */
export default function SsoCallbackScreen() {
  const router = useRouter();
  const colors = useThemeColors();

  useEffect(() => {
    router.replace("/(auth)/login");
  }, [router]);

  return (
    <Screen edges={["top", "bottom"]}>
      <View className="flex-1 items-center justify-center gap-3">
        <ActivityIndicator color={colors.textPrimary} />
        <Text className="text-body text-text-secondary">Signing you in…</Text>
      </View>
    </Screen>
  );
}
