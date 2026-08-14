import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
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
import { SafeAreaView } from "react-native-safe-area-context";

import { GridgoLogo, logoRoleForClientAccount } from "@/components/GridgoLogo";
import { PaginationDots } from "@/components/PaginationDots";
import { PrimaryButton } from "@/components/PrimaryButton";
import {
  illustrations,
  type IllustrationName,
  type IllustrationPalette,
} from "@/components/illustrations";
import { onboardingSlides } from "@/data/onboarding";
import { useThemeColors } from "@/hooks/useTheme";
import { resolveOnboardingDismissTarget } from "@/lib/onboardingExit";
import { useSession } from "@/store/session";

/**
 * Client onboarding.
 *
 * Full-height horizontal pager over the content area so a swipe on the art,
 * the text, or the empty space between pages the same way. Illustrations sit
 * *behind* the pager (pointerEvents none) and still drift at 40% of the text
 * speed with a cross-fade — that parallax must not move into the pager pages.
 *
 * Entry points are explicit via `returnTo` (see `lib/onboardingExit.ts`).
 * Finish and Skip both use that map; history alone is not enough for Settings replay.
 */

const HERO_MAX = 360;

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const accountType = useSession((s) => s.user?.accountType);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  /** Text band height so art stays in the upper region (original visual). */
  const [textBandHeight, setTextBandHeight] = useState(0);

  // `useWindowDimensions` reports 0 on the first web paint, and a negative
  // width is not a valid SVG dimension. Clamp rather than let it through.
  const heroWidth = Math.max(0, Math.min(width - 32, HERO_MAX));
  const last = onboardingSlides.length - 1;

  const palette = {
    ink: colors.accent,
    shade: colors.textSecondary,
    mid: colors.textMuted,
    tint: colors.outline,
    highlight: colors.surface,
  };

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  // The CTA label is React state, so it cannot read the shared value. Settle
  // it once per page rather than on every frame.
  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  function goTo(next: number) {
    scrollRef.current?.scrollTo({ x: next * width, animated: !reducedMotion });
    setIndex(next);
  }

  function dismiss() {
    useSession.getState().clearJustProvisioned();
    const target = resolveOnboardingDismissTarget(returnTo, router.canGoBack());
    if (target.type === "back") router.back();
    else router.replace(target.href);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
      {/* Header stays outside the pager so Skip is never swallowed. */}
      <View className="gg-page flex-row items-center justify-between py-3">
        <GridgoLogo role={logoRoleForClientAccount(accountType)} />
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          className="gg-touch items-end justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-secondary">Skip</Text>
        </Pressable>
      </View>

      {/*
        Content area: art behind (non-interactive), full-height pager on top.
        Footer (dots + CTA) stays below so it keeps its own targets.
      */}
      <View className="flex-1 overflow-hidden">
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            // Leave the measured text band clear so art does not sit under copy.
            bottom: textBandHeight > 0 ? textBandHeight : 0,
            overflow: "hidden",
          }}
        >
          {onboardingSlides.map((slide, slideIndex) => (
            <Hero
              key={slide.id}
              index={slideIndex}
              art={slide.art}
              scrollX={scrollX}
              width={width}
              heroWidth={heroWidth}
              palette={palette}
            />
          ))}
        </View>

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          onMomentumScrollEnd={onMomentumScrollEnd}
          scrollEventThrottle={16}
          // Full content area — not a short text band — so top/mid/bottom swipes page.
          style={StyleSheet.absoluteFillObject}
          // Stretch pages to the pager's laid-out height (gesture surface = art + text).
          contentContainerStyle={{ height: "100%" }}
        >
          {onboardingSlides.map((slide, slideIndex) => (
            <Slide
              key={slide.id}
              active={slideIndex === index}
              index={slideIndex}
              step={slide.step}
              title={slide.title}
              body={slide.body}
              scrollX={scrollX}
              width={width}
              onTextBandLayout={
                slideIndex === 0
                  ? (height) => {
                      // First page sets the art window; others share the same band.
                      if (height > 0) setTextBandHeight(height);
                    }
                  : undefined
              }
            />
          ))}
        </Animated.ScrollView>
      </View>

      <View className="gg-page gap-4 pb-2 pt-5">
        <PaginationDots
          count={onboardingSlides.length}
          activeIndex={index}
          scrollX={scrollX}
          width={width}
          onPress={goTo}
        />
        <PrimaryButton
          label={onboardingSlides[index].cta}
          onPress={() => (index === last ? dismiss() : goTo(index + 1))}
        />
      </View>
    </SafeAreaView>
  );
}

type HeroProps = {
  index: number;
  art: IllustrationName;
  scrollX: SharedValue<number>;
  width: number;
  heroWidth: number;
  palette: IllustrationPalette;
};

/**
 * One piece of art, fading and drifting as its slide comes into view.
 *
 * All three are stacked and absolutely positioned rather than living inside
 * the pager. That is what lets them travel at 40% of the text's speed, and it
 * keeps the swap between beats a cross-fade rather than a hard cut.
 */
function Hero({ index, art, scrollX, width, heroWidth, palette }: HeroProps) {
  const reducedMotion = useReducedMotion();
  const { Component, aspect } = illustrations[art];

  const style = useAnimatedStyle(() => {
    const page = width > 0 ? scrollX.value / width : 0;

    // Reduced motion means no drift and no cross-fade — the art cuts between
    // beats, the way the dots and the text pages already do. Zeroing the
    // translation alone would still leave two pieces dissolving into each
    // other on every swipe.
    if (reducedMotion) {
      return { opacity: Math.round(page) === index ? 1 : 0, transform: [{ translateX: 0 }] };
    }

    const delta = page - index;

    return {
      // Fades out over a little less than a full page, so two pieces never
      // sit on top of each other at half strength.
      opacity: Math.max(0, 1 - Math.abs(delta) * 1.6),
      transform: [{ translateX: -delta * width * 0.4 }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        { alignItems: "center", justifyContent: "center" },
        style,
      ]}
    >
      <Component width={heroWidth} height={heroWidth / aspect} palette={palette} />
    </Animated.View>
  );
}

type SlideProps = {
  /** The settled page, not the scroll position. Drives accessibility only. */
  active: boolean;
  index: number;
  step: string;
  title: string;
  body: string;
  scrollX: SharedValue<number>;
  width: number;
  /** Report text-band height so the art window stays above the copy. */
  onTextBandLayout?: (height: number) => void;
};

/**
 * One full-height text page. The hairline and the step number are the job-ticket
 * language the design-system route already uses, and the number is what states
 * position when motion is off.
 *
 * The page is full height (transparent upper region + text at the bottom) so a
 * horizontal drag over the illustration pages. Art still renders behind the
 * pager; this page does not host the illustration.
 *
 * All three pages stay mounted so the pager can scroll, and fading one out
 * does not take it out of the accessibility tree. Without the two hiding props
 * below, VoiceOver and TalkBack walk straight through headings and copy the
 * user cannot see.
 */
function Slide({
  active,
  index,
  step,
  title,
  body,
  scrollX,
  width,
  onTextBandLayout,
}: SlideProps) {
  const reducedMotion = useReducedMotion();

  const style = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 1 };
    const page = width > 0 ? scrollX.value / width : 0;
    return { opacity: Math.max(0, 1 - Math.abs(page - index)) };
  });

  return (
    <Animated.View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      // height 100% of the pager content container = full swipe surface.
      style={[{ width, height: "100%" }, style]}
    >
      {/* Transparent upper region — gestures land here over the art. */}
      <View style={{ flex: 1 }} />
      <View
        className="gg-page gap-2"
        onLayout={(event) => onTextBandLayout?.(event.nativeEvent.layout.height)}
      >
        <View className="gg-divider" />
        <Text className="pt-2 text-overline text-text-muted">{step}</Text>
        <Text className="text-h1 text-text-primary" accessibilityRole="header">
          {title}
        </Text>
        <Text className="text-body-lg text-text-secondary">{body}</Text>
      </View>
    </Animated.View>
  );
}
