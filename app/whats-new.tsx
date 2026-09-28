import Constants from "expo-constants";
import { CloudOff } from "lucide-react-native";
import { useEffect, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";

import { ReleaseTimeline } from "@/components/ReleaseTimeline";
import { Screen } from "@/components/Screen";
import { SkeletonList } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import {
  mergeHistory,
  readBundledHistory,
  WHATS_NEW_HISTORY_COPY,
} from "@/lib/whatsNewHistory";
import { useAppUpdate } from "@/store/appUpdate";
import { useWhatsNewHistory } from "@/store/whatsNewHistory";

/**
 * Settings > What's new: every release's notes, newest first, each labelled.
 *
 * The history this build shipped with (`extra.whatsNewHistory`) draws at once
 * and offline. Releases made after it are read from GitHub when the page opens
 * and join the list; when that read fails, one calm line says the list stops
 * at this version. See `lib/whatsNewHistory.ts`.
 */
export default function WhatsNewScreen() {
  const colors = useThemeColors();
  const status = useWhatsNewHistory((s) => s.status);
  const online = useWhatsNewHistory((s) => s.online);
  const load = useWhatsNewHistory((s) => s.load);
  // Only a CI build has a version worth marking on the timeline.
  const installed = useAppUpdate((s) => s.installed);
  const installedVersion = installed?.versionName ?? null;
  const shownVersion = installedVersion ?? Constants.expoConfig?.version ?? null;

  const bundled = useMemo(
    () => readBundledHistory(Constants.expoConfig?.extra?.whatsNewHistory),
    [],
  );
  const releases = mergeHistory(bundled, online);

  useEffect(() => {
    void load();
  }, [load]);

  const note =
    status === "offline"
      ? WHATS_NEW_HISTORY_COPY.offline
      : status === "unavailable"
        ? WHATS_NEW_HISTORY_COPY.unavailable
        : null;

  return (
    /* Bottom only — the stack header above has already cleared the status bar. */
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-4 pb-12 pt-4">
          <Text className="text-body text-text-secondary">
            {WHATS_NEW_HISTORY_COPY.intro(shownVersion)}
          </Text>

          {note ? (
            <View
              accessible
              accessibilityRole="text"
              className="gg-panel flex-row items-start gap-3"
            >
              <CloudOff size={18} color={colors.textSecondary} aria-hidden />
              <Text className="flex-1 text-body text-text-secondary">{note}</Text>
            </View>
          ) : null}

          {releases.length > 0 ? (
            <ReleaseTimeline releases={releases} installedVersion={installedVersion} />
          ) : status === "loading" || status === "idle" ? (
            <SkeletonList count={3} />
          ) : (
            <View className="gg-card">
              <Text className="text-body text-text-secondary">{WHATS_NEW_HISTORY_COPY.empty}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
