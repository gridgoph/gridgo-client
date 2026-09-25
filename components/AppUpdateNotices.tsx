import { CircleAlert, CircleArrowDown, CircleCheck, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { useUpdateDownload } from "@/hooks/useUpdateDownload";
import { APP_UPDATE_COPY } from "@/lib/appUpdate";
import { formatRelativeTime } from "@/lib/relativeTime";
import { selectAvailableUpdate, useAppUpdate } from "@/store/appUpdate";

/**
 * App updates in the Notifications tab, pinned above the order list.
 *
 * Both live on the phone alone: the release comes from GitHub and the
 * "Updated to" item from this phone's own launch history, so nothing here is
 * sent to gridgo-api or counted in the unread line, which belongs to jobs.
 *
 * - **App update available** stays while the phone is behind, including after
 *   "Later" put the sheet away, and takes the same download as the sheet.
 * - **Updated to version X** is written once, on the first launch of a new
 *   build, and stays until the client dismisses it or the next build replaces it.
 *
 * Draws nothing when there is nothing to say, so the screen's own empty state
 * is untouched.
 */
export function AppUpdateNotices() {
  const available = useAppUpdate(selectAvailableUpdate);
  const installed = useAppUpdate((s) => s.installed);
  const updatedNotice = useAppUpdate((s) => s.updatedNotice);
  // A notice about a build this phone is no longer running would be a lie.
  const updated =
    updatedNotice && installed && updatedNotice.build.versionCode === installed.versionCode
      ? updatedNotice
      : null;

  if (!available && !updated) return null;

  return (
    <View className="gap-3">
      {available && installed ? (
        <UpdateAvailableCard latestName={available.versionName} installedName={installed.versionName} />
      ) : null}
      {updated ? <UpdatedCard versionName={updated.build.versionName} at={updated.at} /> : null}
    </View>
  );
}

function UpdateAvailableCard({
  latestName,
  installedName,
}: {
  latestName: string;
  installedName: string;
}) {
  const colors = useThemeColors();
  const { update, openFailed } = useUpdateDownload();

  return (
    <View className="gg-panel-high gap-3">
      <View className="flex-row items-start gap-3">
        <CircleArrowDown size={20} color={colors.info} strokeWidth={2} />
        <View className="flex-1 gap-1">
          <Text className="text-body-lg font-medium text-text-primary">
            {APP_UPDATE_COPY.noticeTitle(latestName)}
          </Text>
          <Text className="text-body text-text-secondary">
            {APP_UPDATE_COPY.noticeBody(installedName)}
          </Text>
        </View>
      </View>
      {openFailed ? (
        <View className="flex-row items-start gap-2" accessibilityLiveRegion="polite">
          <CircleAlert size={18} color={colors.error} strokeWidth={2} />
          <Text className="flex-1 text-body text-error">{APP_UPDATE_COPY.openFailed}</Text>
        </View>
      ) : null}
      {/*
        Secondary, not yellow: the tab's yellow is the start-a-print "+", and
        the sheet already spends one on the same verb.
      */}
      <SecondaryButton label={APP_UPDATE_COPY.update} onPress={() => void update()} />
    </View>
  );
}

function UpdatedCard({ versionName, at }: { versionName: string; at: number }) {
  const colors = useThemeColors();
  const dismiss = useAppUpdate((s) => s.dismissUpdatedNotice);

  return (
    <View className="gg-panel flex-row items-start gap-3">
      <CircleCheck size={20} color={colors.success} strokeWidth={2} />
      <View className="flex-1 gap-1">
        <Text className="text-body-lg font-medium text-text-primary">
          {APP_UPDATE_COPY.updatedTitle(versionName)}
        </Text>
        <Text className="text-body text-text-secondary">{APP_UPDATE_COPY.updatedBody}</Text>
        <Text className="text-caption text-text-muted">{formatRelativeTime(at)}</Text>
      </View>
      <Pressable
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel={`${APP_UPDATE_COPY.dismissUpdated}: ${APP_UPDATE_COPY.updatedTitle(versionName)}`}
        className="gg-touch -mr-2 -mt-2 items-center justify-center"
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <X size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
