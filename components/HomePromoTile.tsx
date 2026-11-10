import { ArrowRight, ArrowUpRight, Handshake, Megaphone, Store } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { HOME_TILE_HEIGHT } from "@/components/HomeSmartTile";
import { useThemeColors } from "@/hooks/useTheme";
import { promotionTagLabel, type HomePromotion, type PromotionTag } from "@/lib/homePromos";
import { promoCardColors } from "@/lib/promoCardColors";

type Props = {
  promo: HomePromotion;
  onPress: () => void;
  /** Right padding on the foot line, clear of the rotation's dots. */
  dotsGutter?: number;
};

const TAG_ICONS: Record<PromotionTag, typeof Handshake> = {
  partner: Handshake,
  sponsored: Megaphone,
  featured_shop: Store,
};

/** Room the pager dots take at the foot's right end (HomeRotatingTile): one 12pt current dot, 6pt others, 4pt gaps, 8pt clear. */
export function promoDotsGutter(pages: number): number {
  return pages > 1 ? 12 + (pages - 1) * 10 + 8 : 0;
}

/**
 * One partner page of Home's lower-right tile, on the same three slots as the
 * tile beside it so the pair mirrors: a top row (logo, tag chip where the
 * other tile has its overline and icon), the name on the title line, and a
 * foot line — the promo's link text and an arrow, with the rotation's dots at
 * its right end the way the other tile's progress bar sits at its foot.
 * Colours follow Operations' `color` with readable ink (`lib/promoCardColors`).
 */
export function HomePromoTile({ promo, onPress, dotsGutter = 0 }: Props) {
  const colors = useThemeColors();
  const card = promoCardColors(promo, colors.canvas, colors.outline);
  const TagIcon = TAG_ICONS[promo.tag];
  const tag = promotionTagLabel(promo.tag);
  return (
    <Pressable
      testID={`promo-tile-${promo.id}`}
      onPress={onPress}
      accessibilityRole={promo.tapAction === "link" ? "link" : "button"}
      accessibilityLabel={`${promo.name}. ${tag}`}
      accessibilityHint={promo.tapAction === "link" ? "Opens in your browser" : undefined}
      className="flex-1 justify-between overflow-hidden rounded-card border p-3"
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
      <View className="flex-row items-center justify-between gap-2" style={{ height: PROMO_TOP_ROW }}>
        <PromoLogo uri={promo.logoUrl} name={promo.name} size={PROMO_TOP_ROW} />
        <View testID="promo-tile-tag" className="shrink flex-row items-center gap-1 rounded-pill px-2 py-0.5" style={{ backgroundColor: card.chip }}>
          <TagIcon size={11} color={card.muted} strokeWidth={2.25} />
          <Text className="shrink text-caption font-bold" style={{ color: card.muted, fontSize: 10, lineHeight: 14, letterSpacing: 0.6, textTransform: "uppercase" }} numberOfLines={1}>
            {tag}
          </Text>
        </View>
      </View>
      <View>
        <View className="flex-row items-center gap-1">
          <Text className="flex-1 text-h3" style={{ color: card.ink }} numberOfLines={1}>
            {promo.name}
          </Text>
          {promo.tapAction === "link" ? <ArrowUpRight size={16} color={card.ink} strokeWidth={2} /> : null}
        </View>
        <View className="flex-row items-center gap-1" style={{ height: 16, paddingRight: dotsGutter }}>
          {promo.linkText ? (
            <View testID="promo-tile-link" className="shrink flex-row items-center gap-1">
              <Text className="shrink text-caption font-medium" style={{ color: card.ink }} numberOfLines={1} ellipsizeMode="tail">
                {promo.linkText}
              </Text>
              <ArrowRight size={12} color={card.ink} strokeWidth={2.25} />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** The top row's height: the logo disc matches the left tile's 36pt icon row. */
const PROMO_TOP_ROW = 32;

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
