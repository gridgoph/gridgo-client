import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Screen } from "@/components/Screen";

import {
  useThemeColors,
  useThemeName,
  useThemePreference,
  type ThemePreference,
} from "@/hooks/useTheme";
import { useThemeStore } from "@/store/theme";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Settings — preferences and app help, not identity.
 *
 * Account keeps who is signed in, what GRIDGO matches on, and Sign out.
 * Theme and replaying onboarding live here — and only here. The match ranking
 * used to sit on both screens; two homes for one setting is two places to look
 * and one of them always showing the older answer.
 *
 * No remote load: there is no empty/loading/failed list for this screen; every
 * control is a local preference or a navigation destination.
 */
export default function SettingsScreen() {
  const colors = useThemeColors();
  const scheme = useThemeName();
  const preference = useThemePreference();
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    /* Bottom only — the stack header above has already cleared the status bar. */
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-6 pb-12 pt-4">
          <View className="gg-card gap-3">
            <Text className="text-body-lg font-medium text-text-primary">Theme</Text>
            <Text className="text-body text-text-secondary">
              Showing {scheme === "dark" ? "Dark" : "Light"}
              {preference === "system" ? " (matches your device)" : ""}.
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
                    // Routine control — monochrome accent, never actionYellow.
                    className={
                      selected
                        ? "gg-chip gg-touch border-accent bg-accent px-4"
                        : "gg-chip gg-touch bg-surface px-4"
                    }
                    style={({ pressed }) => (pressed ? { opacity: 0.9 } : undefined)}
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

          <View className="gg-card-flush">
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/onboarding",
                  params: { returnTo: "settings" },
                })
              }
              accessibilityRole="button"
              accessibilityLabel="View onboarding"
              accessibilityHint="Opens the client introduction. Finish or skip returns here."
              className="gg-touch min-h-11 flex-row items-center justify-between px-4 py-3"
              style={({ pressed }) =>
                pressed ? { backgroundColor: colors.surfaceVariant } : undefined
              }
            >
              <Text className="mr-3 flex-1 text-body-lg font-medium text-text-primary">
                View onboarding
              </Text>
              <ChevronRight
                size={20}
                color={colors.textMuted}
                aria-hidden
              />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
