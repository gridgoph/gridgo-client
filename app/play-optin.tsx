import { useFocusEffect } from "expo-router";
import { CircleCheck, Rocket } from "lucide-react-native";
import { useCallback, useEffect } from "react";
import { AppState, Text, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { FormScreen } from "@/components/FormScreen";
import { PlayOptinSteps } from "@/components/PlayOptinSteps";
import { SkeletonBlock, SkeletonLine } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import { currentPlayOptinInstall, usePlayOptin } from "@/store/playOptin";
import { useSession } from "@/store/session";

/**
 * Join the Play closed test (gridgo-api `docs/PLAY_OPTIN_API.md`): opened by
 * Home's card, the `play_optin` push and its inbox row.
 *
 * Gmail → tester group → "Become a tester" on Play → install the Play build.
 * Every step is GRIDGO's answer, read again whenever the person comes back
 * from Google; opening a link is never called done by the app itself.
 */
export default function PlayOptinScreen() {
  const userId = useSession((s) => s.user?.id ?? null);
  const owner = usePlayOptin((s) => s.owner);
  const state = usePlayOptin((s) => (owner === userId ? s.state : null));
  const busy = usePlayOptin((s) => s.busy);
  const error = usePlayOptin((s) => s.error);
  const android = currentPlayOptinInstall().platform === "android";

  const read = useCallback(async () => {
    await usePlayOptin.getState().load(useSession.getState().user?.id ?? null);
    // Entry from a push or the inbox counts as the tap, before any Gmail input.
    if (usePlayOptin.getState().state?.show) usePlayOptin.getState().tapped();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void read();
    }, [read]),
  );

  // Back from Google Groups or Play: read where that left the person.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void usePlayOptin.getState().load(useSession.getState().user?.id ?? null);
    });
    return () => subscription.remove();
  }, []);

  const store = usePlayOptin.getState();

  return (
    <FormScreen>
      <View className="gg-page gap-5 pb-8 pt-4">
        {!android ? (
          <EmptyState title="Android only" body="Play testing runs on Android phones." />
        ) : !state ? (
          <View className="gap-3" testID="optin-loading">
            <SkeletonBlock className="h-14 w-full" />
            <SkeletonLine width="w-2/3" />
            <SkeletonLine width="w-1/2" />
          </View>
        ) : state.optedIn ? (
          <Hero done />
        ) : !state.show ? (
          <EmptyState title="Not open right now" body="We'll ask again when testing opens." />
        ) : (
          <>
            <Hero done={false} />
            <PlayOptinSteps
              state={state}
              busy={busy}
              error={error}
              onConfirmGmail={store.confirmGmail}
              onOpenGroup={() => void store.openGroup()}
              onOpenOptIn={() => void store.openOptIn()}
              onOpenPlayStore={() => void store.openPlayStore()}
            />
          </>
        )}
      </View>
    </FormScreen>
  );
}

function Hero({ done }: { done: boolean }) {
  const colors = useThemeColors();
  const Icon = done ? CircleCheck : Rocket;
  return (
    <View className="flex-row items-center gap-3" accessible accessibilityRole="header">
      <View className="h-14 w-14 items-center justify-center rounded-pill bg-accent">
        <Icon size={26} color={colors.accentOn} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-h2 text-text-primary">{done ? "You're a tester" : "Help us launch on Play"}</Text>
        <Text className="text-caption text-text-secondary">
          {done ? "Thank you. Check in daily from Home." : "Become a tester in 4 steps"}
        </Text>
      </View>
    </View>
  );
}
