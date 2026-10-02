import { MapPin, Star } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { DistanceZone, ShopRating } from "@/lib/api";
import { isOutOfZone, ratingLabel, ratingLine, zoneLine } from "@/lib/distanceZone";

type Props = {
  zone: DistanceZone | null | undefined;
  /** Sent on Out of Zone listings only; the Top Pick never has it. */
  distanceKm?: number | null;
  rating: ShopRating | null | undefined;
  /**
   * `stacked` sets the two halves one above the other, rating first, against
   * the right edge — the Top Pick card's corner beside its name and price.
   */
  layout?: "row" | "stacked";
};

/**
 * A small pin with the zone word, and a star with the rating (#156).
 *
 * Both halves are GRIDGO's answer, read back: the zone is the word from the
 * delivery table and the rating is drawn only when the API sent one (five
 * reviews or more). Neither is guessed, so either half can be absent, and with
 * both absent the line is not drawn at all.
 *
 * Out of Zone takes the warning tone on its pin. The word says the same thing,
 * so colour is never the only carrier.
 */
export function ZoneRatingLine({ zone, distanceKm, rating, layout = "row" }: Props) {
  const colors = useThemeColors();
  const where = zoneLine(zone, distanceKm);
  const score = ratingLine(rating);
  if (!where && !score) return null;
  const far = isOutOfZone(zone);
  const label = [where, ratingLabel(rating)].filter(Boolean).join(", ");

  const place = where ? (
    <View className="flex-row items-center gap-1">
      <MapPin
        size={14}
        color={far ? colors.warning : colors.textMuted}
        strokeWidth={2}
        aria-hidden
      />
      <Text
        className={
          far
            ? "text-caption font-medium text-text-primary"
            : "text-caption text-text-secondary"
        }
      >
        {where}
      </Text>
    </View>
  ) : null;
  const stars = score ? (
    <View className="flex-row items-center gap-1">
      <Star size={14} color={colors.brand} fill={colors.brand} strokeWidth={2} aria-hidden />
      <Text className="text-caption text-text-secondary">{score}</Text>
    </View>
  ) : null;

  return (
    <View
      accessible
      accessibilityLabel={label}
      className={
        layout === "stacked"
          ? "items-end gap-1"
          : "flex-row flex-wrap items-center gap-x-3 gap-y-1"
      }
    >
      {layout === "stacked" ? (
        <>
          {stars}
          {place}
        </>
      ) : (
        <>
          {place}
          {stars}
        </>
      )}
    </View>
  );
}
