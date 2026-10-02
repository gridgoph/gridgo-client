import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { GridgoPrice, gridgoPriceLabel } from "@/components/GridgoPrice";
import { SamplePhoto } from "@/components/SamplePhoto";
import { ZoneRatingLine } from "@/components/ZoneRatingLine";
import { useThemeColors } from "@/hooks/useTheme";
import { ratingLabel, zoneLine } from "@/lib/distanceZone";
import { samplePhotoUri, unitLine } from "@/lib/listing";
import {
  placeLabel,
  placeOrdinal,
  readyInLine,
  type PickableListing,
} from "@/lib/match";
import { printerCapLine } from "@/lib/printerWidth";
import { useServiceFeeRateBps } from "@/store/platformSettings";

type Props = {
  listing: PickableListing;
  onPress: () => void;
  onStalePhoto?: () => Promise<unknown> | void;
};

/**
 * Another listing that can make the client's date (gridgoph/gridgo-client#154).
 *
 * The place in line leads, large, outside the card: it is the one number that
 * differs most from press to press, and the column of them down the left edge
 * is what lets a client compare queues at a glance. Then the same facts the Top
 * Pick carries — sample, name, GRIDGO's price per unit, how soon it is ready,
 * the zone word and the star — and no badge, because no factor chose it.
 *
 * Nothing on the row says whose it is. The API sends these listings with no
 * shop on them at all, and the row would not draw one if it did.
 */
export function OtherListingRow({ listing, onPress, onStalePhoto }: Props) {
  const colors = useThemeColors();
  const rate = useServiceFeeRateBps();
  const photo = listing.photos[0];
  const from = listing.fromPriceMinor !== listing.basePriceMinor ? "From " : "";
  const place = placeOrdinal(listing.placeInLine);
  const readyIn = readyInLine(listing.readyBy);
  const cap = printerCapLine(listing);

  const label = [
    listing.name,
    `${from.toLowerCase()}${gridgoPriceLabel(listing.fromPriceMinor, rate)} ${unitLine(listing)}`,
    readyIn,
    placeLabel(listing.placeInLine),
    cap?.toLowerCase(),
    zoneLine(listing.distanceZone, listing.distanceKm),
    ratingLabel(listing.rating),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-3"
    >
      {({ pressed }) => (
        <>
          <View className="w-16 items-center" aria-hidden>
            <Text
              className="text-h1 text-text-primary"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {place ?? "—"}
            </Text>
            <Text className="text-caption font-bold text-text-primary">IN LINE</Text>
          </View>

          <View className="gg-card-flush min-w-0 flex-1 flex-row items-center gap-3 p-3">
            <View className="w-20">
              <SamplePhoto
                url={samplePhotoUri(photo)}
                expiresAt={photo?.downloadUrlExpiresAt}
                onStale={onStalePhoto}
                altText={listing.name}
                gutter="tight"
                emptyLabel="No sample"
              />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-body-lg font-medium text-text-primary">{listing.name}</Text>
              <GridgoPrice
                supplierMinor={listing.fromPriceMinor}
                prefix={from}
                suffix={` ${unitLine(listing)}`}
                className="text-body font-bold text-text-primary"
              />
              {readyIn ? <Text className="text-caption text-text-muted">{readyIn}</Text> : null}
              {cap ? <Text className="text-caption text-text-muted">{cap}</Text> : null}
              <ZoneRatingLine
                zone={listing.distanceZone}
                distanceKm={listing.distanceKm}
                rating={listing.rating}
              />
            </View>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
            {pressed ? (
              <View pointerEvents="none" className="gg-pressed absolute inset-0" />
            ) : null}
          </View>
        </>
      )}
    </Pressable>
  );
}
