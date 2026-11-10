import { ArrowRight, ArrowUpRight, Handshake, Megaphone, Store } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { HOME_TILE_HEIGHT } from "@/components/HomeSmartTile";
import { useThemeColors } from "@/hooks/useTheme";
import { promotionTagLabel, type HomePromotion, type PromotionTag } from "@/lib/homePromos";

type Props = {
  promo: HomePromotion;
  onPress: () => void;
};

const TAG_ICONS: Record<PromotionTag, typeof Handshake> = {
  partner: Handshake,
  sponsored: Megaphone,
  featured_shop: Store,
};

/**
 * One partner page of Home's lower-right tile. Built like Reorder — a round
 * mark top-left with the tag beside it, the name and the promo's own link
 * line ("Plan your commute →", none when Operations wrote none) at the foot — so the rotation
 * swaps content, never layout. Light sits on the surface; yellow is the
 * Operations-chosen highlight, with ink on it in both themes.
 */
export function HomePromoTile({ promo, onPress }: Props) {
  const colors = useThemeColors();
  const yellow = promo.style === "yellow";
  const ink = yellow ? colors.actionYellowOn : colors.textPrimary;
  const quiet = yellow ? colors.actionYellowOnMuted : colors.textSecondary;
  const accent = yellow ? colors.actionYellowOn : colors.brand;
  const TagIcon = TAG_ICONS[promo.tag];
  const tag = promotionTagLabel(promo.tag);
  return (
    <Pressable
      testID={`promo-tile-${promo.id}`}
      onPress={onPress}
      accessibilityRole={promo.tapAction === "link" ? "link" : "button"}
      accessibilityLabel={`${promo.name}. ${tag}`}
      accessibilityHint={promo.tapAction === "link" ? "Opens in your browser" : undefined}
      className={
        yellow
          ? "flex-1 justify-between overflow-hidden rounded-card border border-action-yellow bg-action-yellow p-3"
          : "flex-1 justify-between overflow-hidden rounded-card border border-outline bg-surface p-3"
      }
      style={({ pressed }) => [{ height: HOME_TILE_HEIGHT }, pressed ? { opacity: 0.75 } : null]}
    >
      {promo.imageUrl ? (
        <Image
          source={{ uri: promo.imageUrl }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "45%", opacity: 0.9 }}
        />
      ) : null}
      <View className="flex-row items-start justify-between gap-2">
        <PromoLogo uri={promo.logoUrl} name={promo.name} size={36} />
        <View className="shrink flex-row items-center gap-1">
          <TagIcon size={12} color={quiet} strokeWidth={2} />
          <Text className="shrink text-caption" style={{ color: quiet }} numberOfLines={1}>
            {tag}
          </Text>
        </View>
      </View>
      <View>
        <View className="flex-row items-center gap-1">
          <Text className="flex-1 text-h3" style={{ color: ink }} numberOfLines={1}>
            {promo.name}
          </Text>
          {promo.tapAction === "link" ? <ArrowUpRight size={16} color={ink} strokeWidth={2} /> : null}
        </View>
        {promo.linkText ? (
          <View testID="promo-tile-link" className="flex-row items-center gap-1">
            <Text className="shrink text-caption font-medium" style={{ color: accent }} numberOfLines={1} ellipsizeMode="tail">
              {promo.linkText}
            </Text>
            <ArrowRight size={12} color={accent} strokeWidth={2.25} />
          </View>
        ) : null}
      </View>
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
