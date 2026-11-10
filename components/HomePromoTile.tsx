import { ArrowRight, ArrowUpRight } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { HOME_TILE_HEIGHT } from "@/components/HomeSmartTile";
import { HomeTileSlots, TILE_SLOTS } from "@/components/HomeTileSlots";
import { useThemeColors } from "@/hooks/useTheme";
import { promotionTagLabel, type HomePromotion } from "@/lib/homePromos";
import { promoCardColors } from "@/lib/promoCardColors";

type Props = {
  promo: HomePromotion;
  onPress: () => void;
};



/**
 * One partner page of Home's lower-right tile, on the shared tile grid
 * (`HomeTileSlots`) so it mirrors the tile beside it: logo and tag chip on the
 * top row, the name on the title line, the promo's link text (72% ink) and an
 * arrow on the subtitle line; the rotation's dots take the footer slot, where
 * the other tile has its progress bar. Colours follow Operations' `color` with
 * readable ink (`lib/promoCardColors`).
 */
export function HomePromoTile({ promo, onPress }: Props) {
  const colors = useThemeColors();
  const card = promoCardColors(promo, colors.canvas, colors.outline);
  const tag = promotionTagLabel(promo.tag);
  return (
    <Pressable
      testID={`promo-tile-${promo.id}`}
      onPress={onPress}
      accessibilityRole={promo.tapAction === "link" ? "link" : "button"}
      accessibilityLabel={`${promo.name}. ${tag}`}
      accessibilityHint={promo.tapAction === "link" ? "Opens in your browser" : undefined}
      className="flex-1 overflow-hidden rounded-card border p-3"
      style={({ pressed }) => [
        { height: HOME_TILE_HEIGHT, backgroundColor: card.background, borderColor: card.border },
        pressed ? { opacity: 0.75 } : null,
      ]}
    >
      {promo.imageUrl ? (
        <Image
          source={{ uri: promo.imageUrl }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "45%", opacity: 0.9 }}
        />
      ) : null}
      <HomeTileSlots
        top={
          <View className="flex-row items-center justify-between gap-2" style={{ height: TILE_SLOTS.top }}>
            <PromoLogo uri={promo.logoUrl} name={promo.name} size={TILE_SLOTS.top} />
            <View testID="promo-tile-tag" className="shrink rounded-pill px-2 py-0.5" style={{ backgroundColor: card.chip }}>
              <Text
                className="shrink text-caption font-bold"
                style={{ color: card.muted, fontSize: 10, lineHeight: 14, letterSpacing: 0.6, textTransform: "uppercase" }}
                numberOfLines={1}
              >
                {tag}
              </Text>
            </View>
          </View>
        }
        title={
          <View className="flex-row items-center gap-1">
            <Text className="flex-1 text-h3" style={{ color: card.ink }} numberOfLines={1}>
              {promo.name}
            </Text>
            {promo.tapAction === "link" ? <ArrowUpRight size={16} color={card.ink} strokeWidth={2} /> : null}
          </View>
        }
        subtitle={
          promo.linkText ? (
            <View testID="promo-tile-link" className="flex-row items-center" style={{ gap: 2 }}>
              <Text testID="promo-tile-link-text" className="shrink text-caption" style={{ color: card.muted }} numberOfLines={1} ellipsizeMode="tail">
                {promo.linkText}
              </Text>
              <ArrowRight size={12} color={card.ink} strokeWidth={2.25} />
            </View>
          ) : null
        }
      />
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
