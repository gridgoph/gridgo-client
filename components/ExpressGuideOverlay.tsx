import { useRouter } from "expo-router";
import { Zap } from "lucide-react-native";
import { useEffect, useState } from "react";
import { AccessibilityInfo, BackHandler, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { holeFor, onScreen, Spotlight, TourCard } from "@/components/TourOverlay";
import { useThemeColors } from "@/hooks/useTheme";
import { canGoBackGuide, GUIDE_LENGTH, GUIDE_SAMPLE_ORDER_ID, guideStep, type GuideProgress } from "@/lib/expressGuide";
import { fitHoleAbove, placeCard } from "@/lib/tour";
import { useExpress } from "@/store/express";
import { useExpressGuide } from "@/store/expressGuide";

type Router = ReturnType<typeof useRouter>;

/** Wait for a pushed screen to finish sliding in. */
const SETTLE_MS = 420;
/** Past this the card is drawn even if the lit control never reported where it is. */
const MEASURE_MS = 900;
const CARD_ESTIMATE = 200;

/**
 * Starts How to order from anywhere: the popup's button, the mission step or
 * Account. The guide's first tip is on Home, so everything over Home closes.
 */
export function startHowToOrder(router: Router) {
  useExpressGuide.getState().start();
  if (router.canDismiss()) router.dismissAll();
  router.navigate("/(tabs)/home");
}

/** What Next does to the screens before the tip moves on. */
function forward(progress: GuideProgress, router: Router) {
  if (progress.step === "end") return;
  const express = useExpress.getState();
  if (progress.step === 0) {
    express.startSample();
    router.push("/express");
  } else if (progress.step === 1) express.goTo("preview");
  else if (progress.step === 2) express.goTo("pay");
  else if (progress.step === 3)
    router.push({
      pathname: "/express/order/[id]",
      params: { id: GUIDE_SAMPLE_ORDER_ID },
    });
}

/** What Back does to the screens. */
function backward(progress: GuideProgress, router: Router) {
  const express = useExpress.getState();
  if (progress.step === 1) router.back();
  else if (progress.step === 2) express.goTo("files");
  else if (progress.step === 3) express.goTo("preview");
  else if (progress.step === 4) router.back();
}

/** Leaves the sample screens. Their own unmount drops the sample. */
function closeSample(progress: GuideProgress, router: Router) {
  if (progress.step === 0) return;
  if (router.canDismiss()) router.dismissAll();
}

/**
 * How to order (gridgo-client#441): five tips over the real Home and Express
 * screens, then an end card that opens Files. It looks like the first-order
 * tour (the same dim, ring and card) but, unlike the tour, it moves the
 * screens itself and the lit control does not act — it is sample data, and
 * the guide never creates a draft or an order. Skip marks it seen; the end
 * card's button marks it completed. Android's back is the card's Back.
 */
export function ExpressGuideOverlay({ ready }: { ready: boolean }) {
  const router = useRouter();
  const colors = useThemeColors();
  const progress = useExpressGuide((s) => s.progress);
  const step = guideStep(progress);
  const measured = useExpressGuide((s) => (step ? s.rects[step.id] : undefined));
  const mounted = useExpressGuide((s) => (step ? (s.mounted[step.id] ?? 0) > 0 : false));
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [cardHeight, setCardHeight] = useState(0);
  const key = progress ? String(progress.step) : null;
  const [settled, setSettled] = useState<string | null>(null);
  const [late, setLate] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    const timers = [
      setTimeout(() => setSettled(key), SETTLE_MS),
      setTimeout(() => setLate(key), SETTLE_MS + MEASURE_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [key]);

  const ending = progress?.step === "end";
  const rect = measured && onScreen(measured, width, height) ? measured : undefined;
  const showing =
    ready && progress !== null && settled === key && (ending || (mounted && rect != null) || late === key);

  const next = () => {
    if (!progress) return;
    forward(progress, router);
    useExpressGuide.getState().next();
  };
  const back = () => {
    if (!progress || !canGoBackGuide(progress)) return;
    backward(progress, router);
    useExpressGuide.getState().back();
  };
  const skip = () => {
    if (!progress) return;
    closeSample(progress, router);
    useExpressGuide.getState().skip();
  };
  const finish = () => {
    useExpressGuide.getState().finish();
    // The sample order screen goes; the Express screen under it is now the
    // client's own Files step.
    useExpress.getState().reset();
    router.back();
  };

  useEffect(() => {
    if (!progress) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBackGuide(progress)) back();
      else skip();
      return true;
    });
    return () => sub.remove();
  });

  useEffect(() => {
    if (showing && step) AccessibilityInfo.announceForAccessibility(`${step.title}. ${step.body}`);
  }, [showing, step]);

  if (!progress) return null;
  if (!showing) {
    // Between tips the screens move; a plain catch keeps a stray tap off the sample.
    return <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} />;
  }

  const padded = !ending && rect ? holeFor(rect, width, height) : null;
  const place = placeCard({
    target: padded,
    cardHeight: cardHeight || CARD_ESTIMATE,
    windowHeight: height,
    insetTop: insets.top,
    insetBottom: insets.bottom,
  });
  const hole = padded && place.side === "pinned" ? fitHoleAbove(padded, place.top) : padded;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Spotlight hole={hole} blockHole />
      <TourCard
        key={key}
        hole={hole}
        place={place}
        visible={cardHeight > 0 || late === key}
        onMeasure={setCardHeight}
        title={step?.title ?? ""}
        body={step?.body ?? ""}
        position={{
          index: ending ? GUIDE_LENGTH : (progress.step as number),
          count: GUIDE_LENGTH + 1,
        }}
        nextText={ending ? "Go to Files" : "Next"}
        backable={canGoBackGuide(progress)}
        onNext={ending ? finish : next}
        onBack={back}
        onSkip={skip}
        skipLabel="Skip How to order"
      >
        {ending ? (
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-pill bg-action-yellow">
              <Zap size={22} color={colors.actionYellowOn} strokeWidth={2.25} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-h3 text-text-primary">You&apos;re ready</Text>
              <Text className="text-body text-text-secondary">Now add your own file.</Text>
            </View>
          </View>
        ) : null}
      </TourCard>
    </View>
  );
}
