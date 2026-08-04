import { router } from "expo-router";
import { useState } from "react";
import {
  Pressable,
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

import { GridgoLogo } from "@/components/GridgoLogo";
import { PaginationDots } from "@/components/PaginationDots";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScooterIllustration } from "@/components/illustrations/ScooterIllustration";
import { onboardingSlides } from "@/data/onboarding";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Client onboarding.
 *
 * Three regions moving at three rates: a fixed illustration that drifts at
 * half speed, a pager carrying only the text, and a fixed footer. The
 * illustration is one layer rather than one copy per page, which is what
 * makes the parallax possible.
 *
 * Reachable from the launcher today. The once-only gate lands with the
 * session store, so nothing here persists.
 */

/** Source viewBox is 659.89 x 509.94. */
const ASPECT = 659.89 / 509.94;
const HERO_MAX = 360;

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);

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
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: reducedMotion ? 0 : -scrollX.value * 0.5 }],
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
      <View className="gg-page flex-row items-center justify-between py-3">
        <GridgoLogo />
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          className="gg-touch items-end justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-secondary">Skip</Text>
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center overflow-hidden">
        <Animated.View style={heroStyle}>
          <ScooterIllustration
            width={heroWidth}
            height={heroWidth / ASPECT}
            palette={palette}
          />
        </Animated.View>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
        style={{ flexGrow: 0 }}
      >
        {onboardingSlides.map((slide, slideIndex) => (
          <Slide
            key={slide.id}
            index={slideIndex}
            step={slide.step}
            title={slide.title}
            body={slide.body}
            scrollX={scrollX}
            width={width}
          />
        ))}
      </Animated.ScrollView>

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

type SlideProps = {
  index: number;
  step: string;
  title: string;
  body: string;
  scrollX: SharedValue<number>;
  width: number;
};

/**
 * One text page. The hairline and the step number are the job-ticket language
 * the design-system route already uses, and the number is what states position
 * when motion is off.
 */
function Slide({ index, step, title, body, scrollX, width }: SlideProps) {
  const reducedMotion = useReducedMotion();

  const style = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 1 };
    const page = width > 0 ? scrollX.value / width : 0;
    return { opacity: Math.max(0, 1 - Math.abs(page - index)) };
  });

  return (
    <Animated.View style={[{ width }, style]}>
      <View className="gg-page gap-2">
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
