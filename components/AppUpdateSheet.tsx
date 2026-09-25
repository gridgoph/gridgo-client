import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { Sheet } from "@/components/Sheet";
import { useThemeColors } from "@/hooks/useTheme";
import { useUpdateDownload } from "@/hooks/useUpdateDownload";
import { APP_UPDATE_COPY, type AppBuild } from "@/lib/appUpdate";
import { selectAvailableUpdate, useAppUpdate } from "@/store/appUpdate";

type Props = {
  /** False while something owns the whole screen (the launch intro). */
  ready: boolean;
};

/**
 * The update prompt, and the confirmation after one.
 *
 * A bottom sheet, not a dialog: nothing is blocked, and every way of putting
 * it away — the close control, the scrim, a drag, Android back — means
 * "Later", and "Later" lasts until the next launch: while the phone is behind,
 * the sheet comes back on every cold launch (`shouldShowUpdatePrompt`). The
 * Notifications tab keeps a card for the same release in between. The
 * confirmation comes first when both are due: a phone that has
 * just updated to a build that is already behind hears that the update worked
 * before it hears about the next one.
 *
 * Mounted once in the root layout, over every route, signed in or not: an
 * old build is just as old on the welcome screen.
 */
export function AppUpdateSheet({ ready }: Props) {
  const completed = useAppUpdate((s) => s.completed);
  const promptOpen = useAppUpdate((s) => s.promptOpen);
  const available = useAppUpdate(selectAvailableUpdate);
  const installed = useAppUpdate((s) => s.installed);

  return (
    <>
      <UpdateCompletedSheet open={ready && completed !== null} build={completed} />
      <UpdateAvailableSheet
        open={ready && completed === null && promptOpen && available !== null}
        installed={installed}
        latest={available}
      />
    </>
  );
}

/**
 * Keeps the last build on screen while the sheet slides away, so the closing
 * frames still read as the sheet that was open rather than an empty panel.
 */
function useLastBuild(build: AppBuild | null): AppBuild | null {
  const [shown, setShown] = useState(build);
  if (build && build !== shown) setShown(build);
  return build ?? shown;
}

function UpdateAvailableSheet({
  open,
  installed,
  latest,
}: {
  open: boolean;
  installed: AppBuild | null;
  latest: AppBuild | null;
}) {
  const colors = useThemeColors();
  const later = useAppUpdate((s) => s.later);
  const shown = useLastBuild(latest);
  const { update, openFailed, clearFailure } = useUpdateDownload();
  const [prevLatest, setPrevLatest] = useState(latest);
  if (prevLatest !== latest) {
    setPrevLatest(latest);
    clearFailure();
  }

  return (
    <Sheet
      open={open}
      title={APP_UPDATE_COPY.availableTitle}
      // Every dismissal is "Later". After "Update now" or "Later" the store has
      // already closed the prompt, so this is a no-op for those.
      onClose={() => {
        if (useAppUpdate.getState().promptOpen) later();
      }}
    >
      <View className="gap-4 px-4 pt-4">
        {shown ? (
          <View
            accessible
            accessibilityLabel={
              installed
                ? `${APP_UPDATE_COPY.installedLabel}: ${installed.versionName}. ${APP_UPDATE_COPY.latestLabel}: ${shown.versionName}.`
                : `${APP_UPDATE_COPY.latestLabel}: ${shown.versionName}.`
            }
            className="gg-panel flex-row items-center gap-3"
          >
            {installed ? (
              <>
                <View className="flex-1 gap-1">
                  <Text className="text-caption text-text-muted">
                    {APP_UPDATE_COPY.installedLabel}
                  </Text>
                  <Text className="text-h3 text-text-secondary">{installed.versionName}</Text>
                </View>
                <ArrowRight size={20} color={colors.textMuted} strokeWidth={2} />
              </>
            ) : null}
            <View className="flex-1 gap-1">
              <Text className="text-caption text-text-muted">{APP_UPDATE_COPY.latestLabel}</Text>
              <Text className="text-h3 text-text-primary">{shown.versionName}</Text>
            </View>
          </View>
        ) : null}

        <Text className="text-body text-text-secondary">{APP_UPDATE_COPY.availableBody}</Text>

        {openFailed ? (
          <View className="flex-row items-start gap-2" accessibilityLiveRegion="polite">
            <CircleAlert size={18} color={colors.error} strokeWidth={2} />
            <Text className="flex-1 text-body text-error">{APP_UPDATE_COPY.openFailed}</Text>
          </View>
        ) : null}

        <View className="gap-3 pb-2">
          <PrimaryButton label={APP_UPDATE_COPY.update} onPress={() => void update()} />
          <SecondaryButton label={APP_UPDATE_COPY.later} onPress={() => later()} />
        </View>
      </View>
    </Sheet>
  );
}

function UpdateCompletedSheet({ open, build }: { open: boolean; build: AppBuild | null }) {
  const colors = useThemeColors();
  const acknowledge = useAppUpdate((s) => s.acknowledgeCompleted);
  const shown = useLastBuild(build);

  return (
    <Sheet open={open} title={APP_UPDATE_COPY.completedTitle} onClose={acknowledge}>
      <View className="gap-4 px-4 pt-4">
        {shown ? (
          <View className="flex-row items-center gap-3">
            <CircleCheck size={24} color={colors.success} strokeWidth={2} />
            <Text className="flex-1 text-body-lg text-text-primary">
              {APP_UPDATE_COPY.completedBody(shown.versionName)}
            </Text>
          </View>
        ) : null}
        <View className="pb-2">
          <SecondaryButton label={APP_UPDATE_COPY.done} onPress={acknowledge} />
        </View>
      </View>
    </Sheet>
  );
}
