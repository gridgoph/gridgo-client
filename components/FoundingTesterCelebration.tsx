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
  FOUNDING_TESTER_STEPS,
} from "@/lib/foundingTester";
import { VOUCHERS_ROUTE } from "@/lib/vouchers";
import { useAppUpdate } from "@/store/appUpdate";
import { useCheckoutExit } from "@/store/checkoutExit";
import { useFoundingTester, useInstallationSettled } from "@/store/foundingTester";
import { usePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

/** The screens a finished mission can be seen from: the tab shell and an order. */
const CELEBRATION_SEGMENTS = new Set(["(tabs)", "order"]);

/**
 * "You're a Founding Tester" — once, the first time GRIDGO's account answer
 * carries an `awardedAt` this phone has not celebrated.
 *
 * Mounted once in the root layout, because the last step is usually
 * finished on an order's survey and the label can also arrive by itself (an
 * account that had finished every step before the path existed). Drawn
 * over the tab shell or an order only, and only once nothing else is asking:
 * not over the update prompt, the notification explainer, the checkout
 * question or a tour step.
 *
 * Short on purpose and a little playful: confetti falls once, the badge
 * lands, the five steps tick in, and the sheet says where the voucher is.
 * Reduce motion draws it at rest, with no confetti at all.
 */
export function FoundingTesterCelebration({ ready }: { ready: boolean }) {
  const segments = useSegments();
  const onScreen = CELEBRATION_SEGMENTS.has(segments[0] ?? "");
  const user = useSession((s) => s.user);
  const hydrated = useFoundingTester((s) => s.hydrated);
  const celebrated = useFoundingTester((s) => s.celebrated);
  const seenOpen = useFoundingTester((s) => s.seenOpen);
  const installationSettled = useInstallationSettled();
  const showing = useFoundingTester((s) => s.showing);
  const close = useFoundingTester((s) => s.close);
  const pushPrompt = usePushPrompt((s) => s.open);
  const updatePrompt = useAppUpdate((s) => s.promptOpen || s.completed !== null);
  const exitQuestion = useCheckoutExit((s) => s.open);
  const tour = useVisibleTourStep();
  const tourShowing = tour.step != null && tour.progress?.status === "active";

  const userId = user?.id ?? null;
  const view = foundingTesterView(user);
  const due = celebrationDue(userId, view, celebrated, seenOpen);
  const clear =
    ready && hydrated && onScreen && installationSettled && !pushPrompt && !updatePrompt && !exitQuestion && !tourShowing;

  // What this installation has seen of the account, once its memory is back:
  // an award already there on first sight is history, never celebrated.
  useEffect(() => {
    if (hydrated && userId) useFoundingTester.getState().observe(userId, view);
  }, [hydrated, userId, view]);

  useEffect(() => {
    if (!due || !clear || !userId || view?.kind !== "earned") return;
    if (useFoundingTester.getState().showing) return;
    useFoundingTester.getState().celebrate(userId, view);
  }, [due, clear, userId, view]);

  // Signed out with it up: nobody is left to celebrate.
  useEffect(() => {
    if (showing && !userId) close();
  }, [showing, userId, close]);

  // The moment is latched; what it says about the voucher follows GRIDGO's
  // latest answer for the same award (a void, a used or expired voucher).
  const latest = view?.kind === "earned" && showing && view.awardedAt === showing.awardedAt ? view : showing;
  const copy = latest ? celebrationCopy(latest) : null;

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

/** The badge settles in under the confetti, then each step ticks in turn. */
function Badge() {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const badge = useSharedValue(reduceMotion ? 1 : 0);
  const confetti = [colors.brand, colors.success, colors.info, colors.warning, colors.error];

  useEffect(() => {
    badge.value = reduceMotion ? 1 : withSpring(1, { damping: 12, stiffness: 180 });
  }, [badge, reduceMotion]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badge.value,
    transform: [{ scale: 0.6 + badge.value * 0.4 }],
  }));

  return (
    <View className="items-center gap-4 pt-2">
      {reduceMotion ? null : (
        <View pointerEvents="none" aria-hidden testID="founding-tester-confetti" style={{ position: "absolute", top: -8, left: 0, right: 0, height: 220 }}>
          {CONFETTI.map((piece, index) => (
            <ConfettiPiece key={index} piece={piece} color={confetti[index % confetti.length]} />
          ))}
        </View>
      )}
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
        {FOUNDING_TESTER_STEPS.map((step, index) => (
          <MissionTick key={step.key} label={step.title} index={index} reduceMotion={reduceMotion} />
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

type Piece = { x: number; delay: number; drift: number; spin: number; size: number; fall: number };

/**
 * Where each piece starts and how it falls, fixed rather than random so the
 * sheet looks the same every time it is captured. `x` is a share of the width.
 */
const CONFETTI: readonly Piece[] = Array.from({ length: 28 }, (_, i) => ({
  x: ((i * 37) % 100) / 100,
  delay: (i * 53) % 420,
  drift: ((i * 29) % 41) - 20,
  spin: ((i * 71) % 2 === 0 ? 1 : -1) * (180 + ((i * 47) % 360)),
  size: 6 + ((i * 13) % 5),
  fall: 150 + ((i * 31) % 70),
}));

/** One piece: falls, drifts, turns and fades, once — about a second and a half. */
function ConfettiPiece({ piece, color }: { piece: Piece; color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(piece.delay, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }));
  }, [progress, piece.delay]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value <= 0 ? 0 : progress.value < 0.75 ? 1 : (1 - progress.value) * 4,
    transform: [
      { translateY: progress.value * piece.fall },
      { translateX: progress.value * piece.drift },
      { rotate: `${progress.value * piece.spin}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: `${piece.x * 100}%`,
          width: piece.size,
          height: piece.size * 0.5,
          borderRadius: 1,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}
