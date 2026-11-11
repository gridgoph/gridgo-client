import { ArrowRight, ArrowUpRight } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { HOME_TILE_MIN_HEIGHT, HomeTileSlots, TILE_SLOTS } from "@/components/HomeTileSlots";
import { useThemeColors } from "@/hooks/useTheme";
import { promotionTagLabel, type HomePromotion } from "@/lib/homePromos";
import { promoCardColors } from "@/lib/promoCardColors";

type Props = {
  promo: HomePromotion;
  onPress: () => void;
  onIntrinsicHeight?: (height: number) => void;
  minHeight?: number;
};

/**
 * One partner page of Home's lower-right tile, on the shared tile grid
 * (`HomeTileSlots`) so it mirrors the tile beside it: logo and tag chip on the
 * top row, the name on the title line, the promo's link text (72% ink) and an
 * arrow on the subtitle line; the rotation's dots take the footer slot, where
 * the other tile has its progress bar. Colours follow Operations' `color` with
 * readable ink (`lib/promoCardColors`).
 *
 * Keep `style` on `Pressable` a plain object: NativeWind's native CSS interop
 * merges `className` with a function `style` into an array `[classStyle, fn]`,
 * which React Native's `Pressable` does not invoke and `View` ignores — dropping
 * `backgroundColor` and `borderColor` on Android and iOS.
 */
export function HomePromoTile({ promo, onPress, onIntrinsicHeight, minHeight }: Props) {
  const colors = useThemeColors();
  const card = promoCardColors(promo, colors.canvas, colors.outline);
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
          {promo.imageUrl ? (
            <Image
              source={{ uri: promo.imageUrl }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "45%", opacity: 0.9 }}
            />
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
 * The partner's logo on a white disc, so a dark or transparent logo reads on
 * either theme and on yellow. Without a logo (or one that will not load) the
 * disc carries the name's first letter.
 */
export function PromoLogo({ uri, name, size }: { uri: string | null; name: string; size: number }) {
  // The failure belongs to the URL that failed: a fresh signed link (or a
  // replaced logo) from the next feed read gets its own attempt.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = Boolean(uri) && uri !== failedUri;
  return (
    <View
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
          style={{ width: size * 0.78, height: size * 0.78 }}
        />
      ) : (
        <Text className="font-bold text-slip-ink" style={{ fontSize: size * 0.42 }}>
          {name.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
