import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GridgoLogo, logoRoleForClientAccount } from "@/components/GridgoLogo";
import { OnboardingMark } from "@/components/OnboardingMark";
import { NotificationPreview } from "@/components/onboarding/NotificationPreview";
import { ScheduleDocket } from "@/components/onboarding/ScheduleDocket";
import { PaginationDots } from "@/components/PaginationDots";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PriorityRankingBoard } from "@/components/PriorityRankingBoard";
import { Screen } from "@/components/Screen";
import { onboardingSteps, type OnboardingStep } from "@/data/onboarding";
import {
  onboardingPushButtons,
  onboardingPushMode,
  onboardingRankingButton,
  onboardingSkip,
  onboardingStepLabel,
} from "@/lib/onboardingFlow";
import { resolveOnboardingDismissTarget } from "@/lib/onboardingExit";
import { estimatePagerHeight } from "@/lib/onboardingStage";
import {
  isCompleteRanking,
  sameRanking,
  togglePlacement,
  type Priority,
} from "@/lib/priorities";
import { hasRanked, usePriorities } from "@/store/priorities";
import { usePush } from "@/store/push";
import { usePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

/**
 * Client onboarding (gridgo-client#159).
 *
 * Six pages in `data/onboarding.ts` order: live tracking, the notification
 * ask, payment held by GRIDGO, the artwork check, ordering at any hour, and
 * the client's ranking. Nothing is asked before a client knows why: the
 * notification page follows the tracking page it explains, the OS dialog is
 * raised only by its button, and no page asks where the client is.
 *
 * The landing ladder sends every unranked client here, so a new client meets
 * it straight after sign-up; saving the ranking lands them Home, where the
 * order tutorial (`lib/tour.ts`) picks up. Settings replays it with
 * `returnTo=settings`. Exits go through `lib/onboardingExit.ts`; what Skip and
 * the yellow button do on each page is `lib/onboardingFlow.ts`.
 *
 * Same pager as before — picture on the page, copy under it, dots with the
 * CTA — so the two interactive pages read as part of one sequence rather than
 * as screens pushed on top of it.
 */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const accountType = useSession((s) => s.user?.accountType);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const [measuredPager, setMeasuredPager] = useState(0);
  const pagerHeight =
    measuredPager > 0
      ? measuredPager
      : estimatePagerHeight(windowHeight, insets.top, insets.bottom);
  const total = onboardingSteps.length;
  const step = onboardingSteps[index];

  // Ranking: the order on screen, against the one GRIDGO holds.
  const saved = usePriorities((s) => s.ranking);
  const ranked = usePriorities(hasRanked);
  const saving = usePriorities((s) => s.saving);
  const saveError = usePriorities((s) => s.saveError);
  const [order, setOrder] = useState<Priority[]>(() => (saved ? [...saved] : []));

  // Notifications: what this phone can do, read without asking for anything.
  const pushSupported = usePush((s) => s.supported);
  const permission = usePush((s) => s.permission);
  const pushBusy = usePush((s) => s.busy);
  const pushMode = onboardingPushMode({ supported: pushSupported, permission });

  useEffect(() => {
    void usePush.getState().syncPermission();
    // Leaving drops an old save failure, so a replay is not greeted by it.
    return () => usePriorities.getState().clearSaveError();
  }, []);

  // The notification page is the explainer, so reaching it starts the
  // explainer's re-offer clock: the sheet on Home must not ask again a minute
  // later. Once per visit.
  const offerStamped = useRef(false);
  useEffect(() => {
    if (step?.kind !== "notifications" || offerStamped.current) return;
    offerStamped.current = true;
    usePushPrompt.getState().markOffered();
  }, [step?.kind]);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  function goTo(next: number) {
    const clamped = Math.max(0, Math.min(total - 1, next));
    scrollRef.current?.scrollTo({ x: clamped * width, animated: !reducedMotion });
    setIndex(clamped);
  }

  function dismiss() {
    useSession.getState().clearJustProvisioned();
    const target = resolveOnboardingDismissTarget(returnTo, router.canGoBack());
    if (target.type === "back") {
      router.back();
      return;
    }
    router.replace(target.href as Href);
  }

  function onPagerLayout(event: LayoutChangeEvent) {
    const next = event.nativeEvent.layout.height;
    setMeasuredPager((current) => (current === next ? current : next));
  }

  const skip = onboardingSkip(onboardingSteps, index, ranked);
  function onSkip() {
    if (!skip) return;
    if (skip.type === "to_ranking") goTo(skip.index);
    else dismiss();
  }

  function place(priority: Priority) {
    // Functional update: quick taps all read the same render's `order`.
    setOrder((current) => togglePlacement(current, priority));
    if (saveError) usePriorities.getState().clearSaveError();
  }

  function resetRanking() {
    setOrder([]);
    if (saveError) usePriorities.getState().clearSaveError();
  }

  async function saveRanking() {
    if (!isCompleteRanking(order)) return;
    const kept = await usePriorities.getState().save(order);
    if (kept) dismiss();
  }

  async function enableNotifications() {
    // The OS dialog, raised by this tap and nothing else. Whatever the answer,
    // the client moves on: a refusal is theirs to give.
    await usePush.getState().enable();
    goTo(index + 1);
  }

  const pushButtons = onboardingPushButtons(pushMode);
  const rankingButton = onboardingRankingButton({
    complete: isCompleteRanking(order),
    saving,
    upToDate: sameRanking(order, saved),
    failed: Boolean(saveError),
  });

  const primaryLabel =
    step.kind === "notifications"
      ? pushBusy
        ? "Waiting for your phone…"
        : pushButtons.primary.label
      : step.kind === "ranking"
        ? rankingButton.label
        : "Next";
  const primaryDisabled =
    step.kind === "notifications"
      ? pushBusy
      : step.kind === "ranking"
        ? rankingButton.disabled
        : false;
  const laterLabel = step.kind === "notifications" ? pushButtons.later : null;

  function onPrimary() {
    if (step.kind === "notifications") {
      const action = pushButtons.primary.action;
      if (action === "enable") {
        void enableNotifications();
        return;
      }
      if (action === "open_settings") void Linking.openSettings();
      goTo(index + 1);
      return;
    }
    if (step.kind === "ranking") {
      if (rankingButton.action === "save") void saveRanking();
      if (rankingButton.action === "finish") dismiss();
      return;
    }
    goTo(index + 1);
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View className="gg-page flex-row items-center justify-between py-3">
        <GridgoLogo size={40} role={logoRoleForClientAccount(accountType)} />
        {skip ? (
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel={skip.label}
            className="gg-touch items-end justify-center"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          >
            <Text className="text-button text-text-secondary">Skip</Text>
          </Pressable>
        ) : (
          <View className="gg-touch" />
        )}
      </View>

      <View className="flex-1" onLayout={onPagerLayout}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          onMomentumScrollEnd={onMomentumScrollEnd}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          bounces={false}
        >
          {onboardingSteps.map((page, pageIndex) => (
            <Page
              key={page.id}
              active={pageIndex === index}
              index={pageIndex}
              scrollX={scrollX}
              width={width}
              height={pagerHeight}
            >
              {page.kind === "ranking" ? (
                <ScrollView
                  className="flex-1"
                  contentContainerClassName="gg-page pb-6 pt-2"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  <Copy
                    stepLabel={onboardingStepLabel(pageIndex, total)}
                    title={page.title}
                    body={page.body}
                  />
                  <View className="mt-6">
                    <PriorityRankingBoard
                      order={order}
                      onPlace={place}
                      onReset={resetRanking}
                      saveError={saveError}
                      saving={saving}
                    />
                  </View>
                </ScrollView>
              ) : (
                <>
                  <PageVisual page={page} />
                  <View className="gg-page pb-1 pt-4">
                    <Copy
                      stepLabel={onboardingStepLabel(pageIndex, total)}
                      title={page.title}
                      body={page.body}
                    />
                    {page.kind === "notifications" && pushButtons.status ? (
                      <Text className="mt-2 text-body text-text-primary">
                        {pushButtons.status}
                      </Text>
                    ) : null}
                  </View>
                </>
              )}
            </Page>
          ))}
        </Animated.ScrollView>
      </View>

      {/*
        The dots belong to the button, not to the empty space above it.
        Centred and pulled in tight, they read as one control.
      */}
      <View className="gg-page gap-2 pb-2 pt-3">
        <View className="items-center">
          <PaginationDots
            count={total}
            activeIndex={index}
            scrollX={scrollX}
            width={width}
            onPress={goTo}
          />
        </View>
        <PrimaryButton label={primaryLabel} onPress={onPrimary} disabled={primaryDisabled} />
        {laterLabel ? (
          <Pressable
            onPress={() => goTo(index + 1)}
            accessibilityRole="button"
            accessibilityLabel={laterLabel}
            className="gg-touch items-center justify-center"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          >
            <Text className="text-button text-text-secondary">{laterLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

/** The picture half of a non-ranking page. */
function PageVisual({ page }: { page: Exclude<OnboardingStep, { kind: "ranking" }> }) {
  if (page.kind === "notifications") return <NotificationPreview />;
  if (page.visual.type === "schedule") return <ScheduleDocket />;
  return (
    <View className="min-h-0 flex-1">
      <OnboardingMark name={page.visual.art} />
    </View>
  );
}

/** Position, heading, one paragraph. Left-aligned on every page. */
function Copy({ stepLabel, title, body }: { stepLabel: string; title: string; body: string }) {
  return (
    <>
      <Text className="text-overline text-text-muted">{stepLabel}</Text>
      <Text className="mt-1.5 text-h1 text-text-primary" accessibilityRole="header">
        {title}
      </Text>
      <Text className="mt-2 text-body-lg text-text-secondary">{body}</Text>
    </>
  );
}

type PageProps = {
  active: boolean;
  index: number;
  scrollX: SharedValue<number>;
  width: number;
  height: number;
  children: ReactNode;
};

/** One page of the pager, faded by how far it is from centre. */
function Page({ active, index, scrollX, width, height, children }: PageProps) {
  const reducedMotion = useReducedMotion();

  const style = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 1 };
    const page = width > 0 ? scrollX.value / width : 0;
    return { opacity: Math.max(0, 1 - Math.abs(page - index)) };
  });

  return (
    <Animated.View
      aria-hidden={!active}
      style={[{ width, height: height > 0 ? height : undefined }, style]}
    >
      {children}
    </Animated.View>
  );
}
