import { ArrowRight, ArrowUpRight } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { HOME_TILE_MIN_HEIGHT, HomeTileSlots, TILE_SLOTS } from "@/components/HomeTileSlots";
import { useThemeColors } from "@/hooks/useTheme";
import { promotionTagLabel, type HomePromotion } from "@/lib/homePromos";
import { promoCardColors, promoShowsCardImage } from "@/lib/promoCardColors";

/** The logo's share of its disc: a square logo's corners stay inside the circle with even padding. */
export const PROMO_LOGO_FIT = 0.64;

type Props = {
  promo: HomePromotion;
  onPress: () => void;
  /** A card image that would not load; the card falls back to its colour. */
  onCardImageError?: (uri: string) => void;
  onIntrinsicHeight?: (height: number) => void;
  minHeight?: number;
};

/**
 * One partner page of Home's lower-right tile, on the shared tile grid
 * (`HomeTileSlots`) so it mirrors the tile beside it: logo and tag chip on the
 * top row, the name on the title line, the promo's link text (72% ink) and an
 * arrow on the subtitle line; the rotation's dots take the footer slot, where
 * the other tile has its progress bar. Colours follow Operations' `color` with
 * readable ink (`lib/promoCardColors`). With a card image (gridgo-client#425)
 * the picture fills the card, centre-cropped, under a dark bottom scrim with
 * white ink; the colour stays behind it while it loads, and the card goes back
 * to the plain colour card if it will not load. The cover (`imageUrl`) belongs
 * to the About sheet and is never drawn here.
 *
 * Keep `style` on `Pressable` a plain object: NativeWind's native CSS interop
 * merges `className` with a function `style` into an array `[classStyle, fn]`,
 * which React Native's `Pressable` does not invoke and `View` ignores — dropping
 * `backgroundColor` and `borderColor` on Android and iOS.
 */
export function HomePromoTile({ promo, onPress, onCardImageError, onIntrinsicHeight, minHeight }: Props) {
  const colors = useThemeColors();
  // The failure belongs to the URL that failed: the next feed's fresh link gets its own attempt.
  const [failedCardUri, setFailedCardUri] = useState<string | null>(null);
  const onImage = promoShowsCardImage(promo, new Set(failedCardUri ? [failedCardUri] : []));
  const card = promoCardColors(promo, colors.canvas, colors.outline, onImage);
  const tag = promotionTagLabel(promo.tag);
  const floor = Math.max(HOME_TILE_MIN_HEIGHT, minHeight ?? 0);
  return (
    <Pressable
      testID={`promo-tile-${promo.id}`}
      onPress={onPress}
      accessibilityRole={promo.tapAction === "link" ? "link" : "button"}
      accessibilityLabel={`${promo.name}. ${tag}`}
      accessibilityHint={promo.tapAction === "link" ? "Opens in your browser" : undefined}
      className="w-full grow overflow-hidden rounded-card border p-3"
      style={{ minHeight: floor, minWidth: 0, backgroundColor: card.background, borderColor: card.border }}
    >
      {({ pressed }) => (
        <>
          {onImage ? (
            <>
              <Image
                testID="promo-tile-card-image"
                source={{ uri: promo.cardImageUrl as string }}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                onError={() => {
                  const uri = promo.cardImageUrl as string;
                  setFailedCardUri(uri);
                  onCardImageError?.(uri);
                }}
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
              />
              <CardScrim />
            </>
          ) : null}
          <HomeTileSlots
            onIntrinsicHeight={onIntrinsicHeight}
            top={
              <View
                className="flex-row flex-wrap items-center justify-between gap-1.5"
                style={{ minHeight: TILE_SLOTS.top, minWidth: 0 }}
              >
                <View className="shrink-0">
                  <PromoLogo uri={promo.logoUrl} name={promo.name} size={28} />
                </View>
                <View
                  testID="promo-tile-tag"
                  className="shrink rounded-xl px-1 py-0.5"
                  style={{ minWidth: 0, backgroundColor: card.chip }}
                >
                  <Text
                    className="shrink text-caption font-bold"
                    style={{
                      minWidth: 0,
                      color: card.muted,
                      fontSize: 10,
                      lineHeight: 15,
                      letterSpacing: 0.2,
                      textTransform: "uppercase",
                    }}
                  >
                    {tag}
                  </Text>
                </View>
              </View>
            }
            title={
              <View className="flex-row items-center gap-1" style={{ minWidth: 0 }}>
                <Text className="flex-1 text-h3" style={{ minWidth: 0, color: card.ink }}>
                  {promo.name}
                </Text>
                {promo.tapAction === "link" ? (
                  <View className="shrink-0">
                    <ArrowUpRight size={16} color={card.ink} strokeWidth={2} />
                  </View>
                ) : null}
              </View>
            }
            subtitle={
              promo.linkText ? (
                <View testID="promo-tile-link" className="flex-row items-center gap-1" style={{ minWidth: 0 }}>
                  <Text
                    testID="promo-tile-link-text"
                    className="shrink text-caption"
                    style={{ color: card.muted, lineHeight: 18 }}
                  >
                    {promo.linkText}
                  </Text>
                  <View className="shrink-0">
                    <ArrowRight size={12} color={card.ink} strokeWidth={2.25} />
                  </View>
                </View>
              ) : null
            }
          />
          {pressed ? <View pointerEvents="none" className="absolute inset-0" style={{ backgroundColor: card.chip }} /> : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * Light at the top, dark from the name down through the link line and dots,
 * so white ink reads on any card image (the name sits mid-card). Drawn, not a library: react-native-svg is already
 * the app's gradient.
 */
function CardScrim() {
  return (
    <View testID="promo-tile-scrim" pointerEvents="none" className="absolute inset-0" aria-hidden>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="gg-promo-scrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity="0.15" />
            <Stop offset="0.4" stopColor="#000000" stopOpacity="0.45" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0.75" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#gg-promo-scrim)" />
      </Svg>
    </View>
  );
}

/**
 * The partner's logo on a white disc, so a dark or transparent logo reads on
 * either theme and on yellow. The logo is always whole: scaled to fit
 * (`contain`) inside the square the circle can hold, with even padding, so a
 * square logo's corners are never cut (gridgo-client#425). Without a logo (or
 * one that will not load) the disc carries the name's first letter.
 */
export function PromoLogo({ uri, name, size }: { uri: string | null; name: string; size: number }) {
  // The failure belongs to the URL that failed: a fresh signed link (or a
  // replaced logo) from the next feed read gets its own attempt.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = Boolean(uri) && uri !== failedUri;
  return (
    <View
      testID="promo-logo"
      className="items-center justify-center overflow-hidden rounded-pill border border-slip-rule bg-slip-paper"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {showImage ? (
        <Image
          testID="promo-logo-image"
          source={{ uri: uri as string }}
          resizeMode="contain"
          onError={() => setFailedUri(uri)}
          style={{ width: size * PROMO_LOGO_FIT, height: size * PROMO_LOGO_FIT }}
        />
      ) : (
        <Text className="font-bold text-slip-ink" style={{ fontSize: size * 0.42 }}>
          {name.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
