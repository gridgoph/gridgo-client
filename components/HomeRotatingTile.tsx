import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  AppState,
  Platform,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { HomePromoTile } from "@/components/HomePromoTile";
import { HOME_TILE_MIN_HEIGHT, TILE_FOOTER_DOTS } from "@/components/HomeTileSlots";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import { homeSlides, nextSlideIndex, PROMO_ROTATE_MS, type HomePromotion } from "@/lib/homePromos";
import { promoCardColors } from "@/lib/promoCardColors";

type Props = {
  /** Today's Reorder tile, drawn unchanged as the first page. */
  reorder: ReactNode;
  promos: readonly HomePromotion[];
  onPromoPress: (promo: HomePromotion) => void;
  /** A page came into view on a focused Home. */
  onPromoShown: (promo: HomePromotion) => void;
  /**
   * Something covers the tile (the promo sheet, the "+" sheet): it neither
   * turns nor counts a view, and resumes with a full five seconds.
   */
  paused?: boolean;
  /** Intrinsic height of the sibling smart tile so horizontal pages stretch to match it. */
  minHeight?: number;
  /** Reports the tallest unstretched promo slide height so the row twin can match it too. */
  onIntrinsicHeight?: (height: number) => void;
};

/**
 * Home's lower-right tile: Reorder plus Operations' live promos, one page at
 * a time. It turns every five seconds, follows a swipe, and holds still while
 * a finger is on it, while Home is not on screen, and for a screen reader.
 * With no live promos it is exactly the Reorder tile, with nothing around it.
 *
 * Paging is a plain horizontal `ScrollView`: the platform's own snap, no
 * gesture library. A copy of Reorder sits after the last promo so the turn
 * back to the start keeps moving forward; landing on the copy jumps to the
 * real Reorder without animation, which looks identical.
 */
export function HomeRotatingTile(props: Props) {
  const cardMinHeight = Math.max(HOME_TILE_MIN_HEIGHT, props.minHeight ?? 0);
  if (!props.promos.length) {
    return (
      <View className="flex-1" style={{ minHeight: cardMinHeight, minWidth: 0, flexBasis: 0 }}>
        {props.reorder}
      </View>
    );
  }
  return <Rotator {...props} />;
}

function Rotator({ reorder, promos, onPromoPress, onPromoShown, paused = false, minHeight, onIntrinsicHeight }: Props) {
  const colors = useThemeColors();
  const [promoHeights, setPromoHeights] = useState<Record<string, number>>({});
  const maxPromoHeight = Math.max(0, ...promos.map((promo) => promoHeights[promo.id] ?? 0));
  const cardMinHeight = Math.max(HOME_TILE_MIN_HEIGHT, minHeight ?? 0, maxPromoHeight);

  useEffect(() => {
    if (maxPromoHeight > 0) onIntrinsicHeight?.(maxPromoHeight);
  }, [maxPromoHeight, onIntrinsicHeight]);
  const reducedMotion = useReducedMotion();
  const slides = homeSlides(promos);
  const count = slides.length;
  const scroll = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  // A ref, read when the timer fires: a finger on the tile holds the page.
  // Lifting it re-arms the full five seconds (`rearm`).
  const touching = useRef(false);
  const [rearm, setRearm] = useState(0);
  const [focused, setFocused] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState !== "background");
  const screenReader = useScreenReader();

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => setForeground(next === "active"));
    return () => subscription.remove();
  }, []);

  // A promo removed on the Promotions page can leave the index past the end.
  const current = index < count ? index : 0;
  const slide = slides[current];
  const shownPromo = slide.kind === "promo" ? slide.promo : null;
  // "Shown" means on screen and uncovered: a view is never counted under a sheet.
  const visible = focused && foreground && width > 0 && !paused;

  useEffect(() => {
    if (visible && shownPromo) onPromoShown(shownPromo);
  }, [visible, shownPromo, onPromoShown]);

  // Re-armed whenever the page changes, so a swipe gets its full five seconds.
  const running = visible && !screenReader;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => {
      if (touching.current) {
        setRearm((n) => n + 1);
        return;
      }
      const next = current + 1; // `count` is the copy of Reorder.
      if (reducedMotion) {
        const wrapped = nextSlideIndex(current, count);
        scroll.current?.scrollTo({ x: wrapped * width, animated: false });
        setIndex(wrapped);
        return;
      }
      scroll.current?.scrollTo({ x: next * width, animated: true });
    }, PROMO_ROTATE_MS);
    return () => clearTimeout(timer);
  }, [running, current, count, width, reducedMotion, rearm]);

  const hold = () => {
    touching.current = true;
  };
  const release = () => {
    if (!touching.current) return;
    touching.current = false;
    setRearm((n) => n + 1);
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const x = event.nativeEvent.contentOffset.x;
    const page = Math.round(x / width);
    if (page >= count && Math.abs(x - count * width) < 1) {
      scroll.current?.scrollTo({ x: 0, animated: false });
      setIndex(0);
      return;
    }
    // Wait for the snap to settle before the dots and the view count move.
    if (Math.abs(x - page * width) < 1 && page < count && page !== current) setIndex(page);
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) {
      setWidth(next);
      scroll.current?.scrollTo({ x: current * next, animated: false });
    }
  };

  const card = slide.kind === "promo" ? promoCardColors(slide.promo, colors.canvas, colors.outline) : null;
  const dotOn = card ? card.ink : colors.textPrimary;
  const dotOff = card ? card.muted : colors.textMuted;

  return (
    <View
      testID="home-rotating-tile"
      className="flex-1 overflow-hidden rounded-card"
      // minWidth 0: the pages' scroll content must not widen this column past its twin.
      style={{ minHeight: cardMinHeight, minWidth: 0, flexBasis: 0 }}
      onLayout={onLayout}
      onTouchStart={hold}
      onTouchEnd={release}
      onTouchCancel={release}
    >
      <ScrollView
        ref={scroll}
        testID="home-rotating-scroll"
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentContainerStyle={{ alignItems: "stretch" }}
        onScroll={onScroll}
        onScrollBeginDrag={hold}
        onScrollEndDrag={release}
      >
        {[...slides, slides[0]].map((page, position) => {
          const copy = position === count;
          return (
            <View
              key={copy ? "reorder-copy" : page.kind === "promo" ? page.promo.id : "reorder"}
              style={{ width: width || undefined, flexShrink: 0, minHeight: cardMinHeight }}
              // The copy is a visual seam only: hidden from touch-free readers.
              importantForAccessibility={copy ? "no-hide-descendants" : "auto"}
              accessibilityElementsHidden={copy}
              aria-hidden={copy || undefined}
              className="grow items-stretch"
            >
              {page.kind === "reorder" ? (
                copy ? <View className="w-full grow" pointerEvents="none">{reorder}</View> : reorder
              ) : (
                <HomePromoTile
                  promo={page.promo}
                  minHeight={cardMinHeight}
                  onIntrinsicHeight={(height) =>
                    setPromoHeights((prev) => (prev[page.promo.id] === height ? prev : { ...prev, [page.promo.id]: height }))
                  }
                  onPress={() => onPromoPress(page.promo)}
                />
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Where the rotation stands. Ink, never yellow; decoration for a reader. */}
      <View
        testID="home-rotating-dots"
        pointerEvents="none"
        aria-hidden
        className="absolute flex-row items-center gap-1"
        style={TILE_FOOTER_DOTS}
      >
        {slides.map((_, position) => (
          <View
            key={position}
            className="h-1.5 rounded-pill"
            style={{ width: position === current ? 12 : 6, backgroundColor: position === current ? dotOn : dotOff }}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * A screen reader moves through Home itself; the tile does not move under it.
 * Native only: react-native-web answers `true` on every browser, which would
 * stop the rotation for everyone on web.
 */
function useScreenReader(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => {
        if (alive) setEnabled(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", setEnabled);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}
