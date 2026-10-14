import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Screen } from "@/components/Screen";

import {
  useThemeColors,
  useThemeName,
  useThemePreference,
  type ThemePreference,
} from "@/hooks/useTheme";
import { UPDATE_SOUND_COPY } from "@/lib/notificationNudge";
import { previewUpdateChime } from "@/lib/updateChime";
import { WHATS_NEW_HISTORY_COPY } from "@/lib/whatsNewHistory";
import { useNotificationNudge } from "@/store/notificationNudge";
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
 * Theme, the update sound, the What's new history and replaying onboarding live here — and only here. The match ranking
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
  const muted = useNotificationNudge((s) => s.muted);
  const setMuted = useNotificationNudge((s) => s.setMuted);
  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    // Turning it on plays it once, so the client hears what they chose.
    if (!next) previewUpdateChime();
  };

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

          {/*
            The bell's chime (#230). The whole row is the switch, so the
            target is the row and not a 51pt thumb at its edge; the Switch is
            drawn for its shape and takes no touch of its own.
          */}
          <Pressable
            onPress={toggleSound}
            accessibilityRole="switch"
            accessibilityLabel={UPDATE_SOUND_COPY.label}
            accessibilityHint={UPDATE_SOUND_COPY.caption}
            accessibilityState={{ checked: !muted }}
            aria-checked={!muted}
            className="gg-card gg-touch flex-row items-center gap-3"
            style={({ pressed }) =>
              pressed ? { backgroundColor: colors.surfaceVariant } : undefined
            }
          >
            <View className="flex-1 gap-1">
              <Text className="text-body-lg font-medium text-text-primary">
                {UPDATE_SOUND_COPY.label}
              </Text>
              <Text className="text-body text-text-secondary">{UPDATE_SOUND_COPY.caption}</Text>
            </View>
            <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
              {/*
                Ink on, muted grey off — the theme chips' monochrome, never a
                platform green. react-native-web colours an "on" thumb from
                its own `activeThumbColor` (teal by default) and ignores
                `thumbColor` there, so web is told the same colour by name.
              */}
              <Switch
                value={!muted}
                trackColor={{ false: colors.outline, true: colors.accent }}
                thumbColor={muted ? colors.textMuted : colors.accentOn}
                ios_backgroundColor={colors.outline}
                {...(Platform.OS === "web" ? ({ activeThumbColor: colors.accentOn } as object) : {})}
              />
            </View>
          </Pressable>

          <View className="gg-card-flush">
            <Pressable
              onPress={() => router.push("/whats-new")}
              accessibilityRole="button"
              accessibilityLabel={WHATS_NEW_HISTORY_COPY.settingsRow}
              accessibilityHint={WHATS_NEW_HISTORY_COPY.settingsHint}
              className="gg-touch min-h-11 flex-row items-center justify-between px-4 py-3"
              style={({ pressed }) =>
                pressed ? { backgroundColor: colors.surfaceVariant } : undefined
              }
            >
              <View className="mr-3 flex-1">
                <Text className="text-body-lg font-medium text-text-primary">
                  {WHATS_NEW_HISTORY_COPY.settingsRow}
                </Text>
                <Text className="text-caption text-text-muted">
                  {WHATS_NEW_HISTORY_COPY.settingsCaption}
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textMuted} aria-hidden />
            </Pressable>
            <View className="gg-divider" />
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
