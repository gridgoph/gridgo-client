import { router, useSegments } from "expo-router";
import { Award, Check } from "lucide-react-native";
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { Sheet } from "@/components/Sheet";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import { useVisibleTourStep } from "@/hooks/useTourStep";
import {
  celebrationCopy,
  celebrationDue,
  foundingTesterView,
  FOUNDING_TESTER_MISSIONS,
} from "@/lib/foundingTester";
import { VOUCHERS_ROUTE } from "@/lib/vouchers";
import { useAppUpdate } from "@/store/appUpdate";
import { useCheckoutExit } from "@/store/checkoutExit";
import { useFoundingTester } from "@/store/foundingTester";
import { usePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

/** The screens a finished mission can be seen from: the tab shell and an order. */
const CELEBRATION_SEGMENTS = new Set(["(tabs)", "order"]);

/**
 * "You're a Founding Tester" — once, the first time GRIDGO's account answer
 * carries an `awardedAt` this phone has not celebrated.
 *
 * Mounted once in the root layout, because the third mission is usually
 * finished on an order's survey and the label can also arrive by itself (an
 * account that had finished all three before the missions existed). Drawn
 * over the tab shell or an order only, and only once nothing else is asking:
 * not over the update prompt, the notification explainer, the checkout
 * question or a tour step.
 *
 * Short on purpose: the badge lands, the three missions tick in, and the
 * sheet says where the voucher is. Reduce motion draws it at rest.
 */
export function FoundingTesterCelebration({ ready }: { ready: boolean }) {
  const segments = useSegments();
  const onScreen = CELEBRATION_SEGMENTS.has(segments[0] ?? "");
  const user = useSession((s) => s.user);
  const hydrated = useFoundingTester((s) => s.hydrated);
  const celebrated = useFoundingTester((s) => s.celebrated);
  const showing = useFoundingTester((s) => s.showing);
  const close = useFoundingTester((s) => s.close);
  const pushPrompt = usePushPrompt((s) => s.open);
  const updatePrompt = useAppUpdate((s) => s.promptOpen || s.completed !== null);
  const exitQuestion = useCheckoutExit((s) => s.open);
  const tour = useVisibleTourStep();
  const tourShowing = tour.step != null && tour.progress?.status === "active";

  const userId = user?.id ?? null;
  const view = foundingTesterView(user);
  const due = celebrationDue(userId, view, celebrated);
  const clear = ready && hydrated && onScreen && !pushPrompt && !updatePrompt && !exitQuestion && !tourShowing;

  useEffect(() => {
    if (!due || !clear || !userId || view?.kind !== "earned") return;
    if (useFoundingTester.getState().showing) return;
    useFoundingTester.getState().celebrate(userId, view);
  }, [due, clear, userId, view]);

  // Signed out with it up: nobody is left to celebrate.
  useEffect(() => {
    if (showing && !userId) close();
  }, [showing, userId, close]);

  const copy = showing ? celebrationCopy(showing) : null;

  return (
    <Sheet open={Boolean(showing) && ready} title={copy?.title ?? ""} onClose={close} maxHeightRatio={0.9}>
      {copy ? (
        <View className="gap-5 px-4 pt-2">
          <Badge />
          <Text className="text-body-lg text-text-secondary">{copy.body}</Text>
          <View className="gap-3 pb-2">
            <PrimaryButton
              label={copy.action}
              onPress={() => {
                close();
                router.push(VOUCHERS_ROUTE);
              }}
            />
            <SecondaryButton label="Done" onPress={close} />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/** The badge settles in, then each mission ticks in turn. */
function Badge() {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const badge = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    badge.value = reduceMotion ? 1 : withSpring(1, { damping: 12, stiffness: 180 });
  }, [badge, reduceMotion]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badge.value,
    transform: [{ scale: 0.6 + badge.value * 0.4 }],
  }));

  return (
    <View className="items-center gap-4 pt-2">
      <Animated.View style={badgeStyle}>
        <View className="h-20 w-20 items-center justify-center rounded-pill border-2" style={{ borderColor: colors.brand }}>
          <View
            pointerEvents="none"
            className="absolute inset-0 rounded-pill"
            style={{ backgroundColor: colors.brand, opacity: 0.14 }}
          />
          <Award size={38} color={colors.brand} strokeWidth={2} />
        </View>
      </Animated.View>
      <View className="flex-row flex-wrap justify-center gap-2">
        {FOUNDING_TESTER_MISSIONS.map((mission, index) => (
          <MissionTick key={mission.key} label={mission.title} index={index} reduceMotion={reduceMotion} />
        ))}
      </View>
    </View>
  );
}

function MissionTick({ label, index, reduceMotion }: { label: string; index: number; reduceMotion: boolean }) {
  const colors = useThemeColors();
  const shown = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    shown.value = reduceMotion
      ? 1
      : withDelay(260 + index * 160, withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }));
  }, [shown, index, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 6 }],
  }));

  return (
    <Animated.View style={style}>
      <View className="gg-chip">
        <Check size={14} color={colors.success} strokeWidth={2.5} aria-hidden />
        <Text className="text-caption text-text-primary">{label}</Text>
      </View>
    </Animated.View>
  );
}
