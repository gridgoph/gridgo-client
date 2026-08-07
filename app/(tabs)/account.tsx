import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SecondaryButton } from "@/components/SecondaryButton";
import { getApiBase } from "@/lib/api";
import {
  useThemeColors,
  useThemeName,
  useThemePreference,
  type ThemePreference,
} from "@/hooks/useTheme";
import { useSession } from "@/store/session";
import { useThemeStore } from "@/store/theme";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Account: identity, organisation, theme override, API base, sign out.
 */
export default function AccountScreen() {
  const { user, logout } = useSession();
  const colors = useThemeColors();
  const scheme = useThemeName();
  const preference = useThemePreference();
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-6 pb-12 pt-4">
        <Text className="text-h2 text-text-primary">Account</Text>

        <View className="gg-card gap-1">
          <Text className="text-caption text-text-muted">Identity</Text>
          <Text className="text-body-lg font-medium text-text-primary">{user?.name}</Text>
          <Text className="text-body text-text-secondary">{user?.email}</Text>
          <Text className="mt-2 text-caption text-text-muted">Role: {user?.role}</Text>
        </View>

        <View className="gg-card gap-1">
          <Text className="text-caption text-text-muted">Organisation</Text>
          <Text className="text-body-lg font-medium text-text-primary">
            {user?.orgName || "—"}
          </Text>
        </View>

        <View className="gg-card gap-3">
          <Text className="text-body-lg font-medium text-text-primary">Theme</Text>
          <Text className="text-body text-text-secondary">
            Light and Dark are the same product. Currently showing{" "}
            {scheme === "dark" ? "Dark" : "Light"}
            {preference === "system" ? " (following system)" : ""}.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {THEME_OPTIONS.map((option) => {
              const selected = option.value === preference;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setPreference(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={
                    selected
                      ? "gg-chip gg-touch border-accent bg-accent px-4"
                      : "gg-chip gg-touch bg-surface px-4"
                  }
                >
                  <Text
                    className={
                      selected
                        ? "text-button text-accent-on"
                        : "text-button text-text-secondary"
                    }
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gg-card gap-1">
          <Text className="text-caption text-text-muted">Backend</Text>
          <Text className="text-body text-text-primary" selectable>
            {getApiBase()}
          </Text>
        </View>

        <SecondaryButton label="Sign out" onPress={() => void logout()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
