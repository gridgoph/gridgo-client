import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { GridgoPrice, gridgoPriceLabel } from "@/components/GridgoPrice";
import { SamplePhoto } from "@/components/SamplePhoto";
import { ZoneRatingLine } from "@/components/ZoneRatingLine";
import { useThemeColors } from "@/hooks/useTheme";
import type { MatchListing, MatchResult } from "@/lib/api";
import { ratingLabel, zoneLine } from "@/lib/distanceZone";
import { samplePhotoUri, unitLine } from "@/lib/listing";
import { matchBadge, placeLabel, placeOrdinal, readyInLine } from "@/lib/match";
import { printerCapLine } from "@/lib/printerWidth";
import { readyByDate } from "@/lib/readyTime";
import { useServiceFeeRateBps } from "@/store/platformSettings";

type Props = {
  match: MatchResult;
  /** The Top Pick listing — `match.listings[0]`. */
  listing: MatchListing;
  onPress: () => void;
  /** The screen's re-read for an expired photo link (`SamplePhoto.onStale`). */
  onStalePhoto?: () => Promise<unknown> | void;
};

/**
 * GRIDGO's Top Pick for the job (gridgoph/gridgo-client#154).
 *
 * The one listing GRIDGO recommends, ringed in the brand gold so it reads as
 * the answer before a word of it is read, and carrying the one badge that says
 * which of the client's priorities decided it — "MATCHED FOR QUALITY" — in the
 * API's own words. Then the product as the client will buy it: the sample,
 * the name, GRIDGO's price per unit, the star when the shop has earned one and
 * the zone word. Then the two numbers a client plans around, side by side: the
 * place this job would take in the queue, drawn large, and the date it would
 * be ready by.
 *
 * No shop appears. The match still picked a real press, and the API still
 * sends its `shop` block for compatibility, but this card never reads it —
 * which press runs the job is GRIDGO's business, and a name or an address here
 * would hand back the comparing the whole flow exists to remove.
 *
 * The ring is the brand gold, not the action yellow: the one yellow fill on the
 * screen is Proceed, the action this card describes. Gold also holds its
 * contrast on a white card, where the action yellow all but disappears.
 */
export function TopPickCard({ match, listing, onPress, onStalePhoto }: Props) {
  const colors = useThemeColors();
  const rate = useServiceFeeRateBps();
  const badge = matchBadge(match);
  const photo = listing.photos[0];
  const from = listing.fromPriceMinor !== listing.basePriceMinor ? "From " : "";
  const placeInLine =
    listing.placeInLine ?? (match.queue ? match.queue.jobsAhead + 1 : null);
  const place = placeOrdinal(placeInLine);
  const promise = listing.readyBy ?? match.promiseBy ?? null;
  const readyBy = readyByDate(promise);
  const readyIn = readyInLine(promise);
  const cap = printerCapLine(listing);
  const zone = match.distanceZone ?? listing.distanceZone;
  const rating = match.rating ?? listing.rating;

  const label = [
    `Top pick${badge ? `, ${match.matchReason?.label}` : ""}`,
    listing.name,
    `${from.toLowerCase()}${gridgoPriceLabel(listing.fromPriceMinor, rate)} ${unitLine(listing)}`,
    placeLabel(placeInLine),
    readyBy ? `ready by ${readyBy}` : null,
    readyIn,
    zoneLine(zone, listing.distanceKm),
    ratingLabel(rating),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens this listing to set it up"
      className="overflow-hidden rounded-card border-2 border-brand bg-surface"
    >
      {({ pressed }) => (
        <>
          <View className="flex-row flex-wrap items-baseline gap-x-2 gap-y-1 px-4 pb-2 pt-3">
            <Text className="text-h3 text-brand">TOP PICK</Text>
            {badge ? (
              <Text className="text-overline font-bold text-text-primary">{badge}</Text>
            ) : null}
          </View>

          <View className="px-2">
            <SamplePhoto
              url={samplePhotoUri(photo)}
              expiresAt={photo?.downloadUrlExpiresAt}
              onStale={onStalePhoto}
              altText={photo?.altText ?? `Sample ${listing.name} printed through GRIDGO`}
              ratio="banner"
              emptyLabel="No sample photo yet"
            />
          </View>

          <View className="flex-row items-start gap-3 px-4 pt-3">
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-body-lg font-medium text-text-primary">{listing.name}</Text>
              <GridgoPrice
                supplierMinor={listing.fromPriceMinor}
                prefix={from}
                suffix={` ${unitLine(listing)}`}
                className="text-body-lg font-bold text-text-primary"
              />
              {cap ? <Text className="text-caption text-text-muted">{cap}</Text> : null}
            </View>
            <ZoneRatingLine
              zone={zone}
              distanceKm={listing.distanceKm}
              rating={rating}
              layout="stacked"
            />
          </View>

          {/*
            The two numbers a client plans around. The place is the big one:
            it is the queue GRIDGO counted from jobs really in front, and the
            thing that changes between one press and the next.
          */}
          <View className="mx-4 mb-4 mt-3 flex-row items-center border-t border-outline pt-3">
            <View className="pr-4">
              <Text className="text-overline text-text-muted">YOUR PLACE</Text>
              <Text className="text-display text-text-primary">{place ?? "—"}</Text>
              <Text className="text-overline font-bold text-text-primary">IN LINE</Text>
            </View>
            <View className="min-w-0 flex-1 gap-0.5 self-stretch border-l border-outline pl-4">
              <Text className="text-overline text-text-muted">READY BY</Text>
              <Text className="text-body-lg font-medium text-text-primary">
                {readyBy ?? "GRIDGO confirms"}
              </Text>
              {readyIn ? <Text className="text-caption text-text-muted">{readyIn}</Text> : null}
            </View>
            <ChevronRight size={20} color={colors.textPrimary} strokeWidth={2.5} aria-hidden />
          </View>

          {pressed ? (
            <View pointerEvents="none" className="gg-pressed absolute inset-0" />
          ) : null}
        </>
      )}
    </Pressable>
  );
}
