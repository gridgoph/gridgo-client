import { ExternalLink } from "lucide-react-native";
import { Image, Pressable, Text, View } from "react-native";

import { PromoLogo } from "@/components/HomePromoTile";
import { Sheet } from "@/components/Sheet";
import { useThemeColors } from "@/hooks/useTheme";
import { promoLinkLabel, promotionTagLabel, type HomePromotion } from "@/lib/homePromos";

type Props = {
  promo: HomePromotion | null;
  onClose: () => void;
  /** The one button: open the partner's link in the browser. */
  onOpenLink: (promo: HomePromotion) => void;
};

/**
 * A partner promo, opened from Home's tile: logo, name, tag, the short
 * description, and one big button to the partner's site. Nothing else — it is
 * an introduction, not a page of GRIDGO.
 */
export function PromoSheet({ promo, onClose, onOpenLink }: Props) {
  const colors = useThemeColors();
  return (
    <Sheet open={promo !== null} onClose={onClose} title={promo?.name ?? ""}>
      {promo ? (
        <View testID="promo-sheet" className="gap-4 px-4 pb-2 pt-4">
          {promo.imageUrl ? (
            <Image
              source={{ uri: promo.imageUrl }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              className="w-full rounded-card bg-surface-variant"
              style={{ aspectRatio: 16 / 9 }}
            />
          ) : null}
          <View className="flex-row items-center gap-3">
            <PromoLogo uri={promo.logoUrl} name={promo.name} size={56} />
            <View className="rounded-pill border border-outline px-3 py-1">
              <Text className="text-caption font-medium text-text-secondary">{promotionTagLabel(promo.tag)}</Text>
            </View>
          </View>
          {promo.description ? (
            <Text className="text-body-lg text-text-secondary">{promo.description}</Text>
          ) : null}
          <Pressable
            testID="promo-sheet-link"
            onPress={() => onOpenLink(promo)}
            accessibilityRole="link"
            accessibilityLabel={promoLinkLabel(promo)}
            accessibilityHint="Opens in your browser"
            className="gg-btn-primary h-12"
          >
            {({ pressed }) => (
              <>
                <Text className="text-button text-action-yellow-on">{promoLinkLabel(promo)}</Text>
                <ExternalLink size={18} color={colors.actionYellowOn} strokeWidth={2} />
                {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-field" /> : null}
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </Sheet>
  );
}
