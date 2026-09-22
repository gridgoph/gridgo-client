import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { GridgoPrice, gridgoPriceLabel } from "@/components/GridgoPrice";
import { SamplePhoto } from "@/components/SamplePhoto";
import { spacing, typography } from "@/constants/theme";
import type { CatalogItem } from "@/lib/api";
import { readyInLine, samplePhotoUri, unitLine } from "@/lib/listing";
import type { ProductSubcategory } from "@/lib/productCategories";
import { useServiceFeeRateBps } from "@/store/platformSettings";

type Props = {
  subcategory: ProductSubcategory;
  listing: CatalogItem | null;
  onPress: () => void;
};

type CardProps = Props & {
  /** Square on the wall, where the card is the page. Wide in a strip. */
  photoRatio?: "square" | "wide";
  /**
   * The contents line. On the category wall it is what separates two
   * neighbouring families; in Home's strip the board underneath already lists
   * them, so the card is a photograph and a price and nothing else.
   */
  showExamples?: boolean;
};

/**
 * The peso line: GRIDGO's price for the cheapest way this sells, and its unit.
 * `spoken` is the same figure for the row's label; the drawn one goes through
 * `GridgoPrice`, which waits for the rate rather than showing the shop's own.
 */
function moneyLine(
  listing: CatalogItem | null,
  rate: number | null,
): { supplierMinor: number; spoken: string; unit: string } | null {
  if (!listing) return null;
  return {
    supplierMinor: listing.fromPriceMinor,
    spoken: `from ${gridgoPriceLabel(listing.fromPriceMinor, rate)}`,
    unit: unitLine(listing),
  };
}

function sampleUrl(listing: CatalogItem | null): string | null {
  return listing ? samplePhotoUri(listing.photos[0]) : null;
}

/**
 * One thing GRIDGO can print, as a quote strip.
 *
 * Sample on the left, what it is in the middle, the peso amount and how it is
 * sold on the right — the same strip a shop scans on its own board, minus the
 * press's name. A client picking flyers is choosing the work, not the shop.
 */
export function CategorySampleRow({ subcategory, listing, onPress }: Props) {
  const rate = useServiceFeeRateBps();
  const money = moneyLine(listing, rate);
  const ready = listing ? readyInLine(listing.turnaroundHours) : null;

  return (
    <View className="flex-row items-start gap-3 rounded-card border border-outline bg-surface py-1 pr-4">
      <View className="w-28 shrink-0">
        <SamplePhoto
          url={sampleUrl(listing)}
          altText={listing?.photos[0]?.altText ?? subcategory.name}
          emptyLabel="No sample"
          gutter="tight"
        />
      </View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          money
            ? `${subcategory.name}, ${money.spoken} ${money.unit}`
            : subcategory.name
        }
        accessibilityHint="Finds GRIDGO's printer for this"
        className="min-w-0 flex-1 flex-row items-start gap-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View className="min-w-0 flex-1 gap-1 py-3">
          <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
            {subcategory.name}
          </Text>
          {subcategory.examples ? (
            <Text className="text-caption text-text-muted" numberOfLines={2}>
              {subcategory.examples}
            </Text>
          ) : null}
          {ready ? (
            <Text className="text-caption text-text-muted" numberOfLines={1}>
              {ready}
            </Text>
          ) : null}
        </View>
        {money ? (
          <View className="max-w-[42%] shrink-0 items-end gap-0.5 py-3">
            <GridgoPrice
              supplierMinor={money.supplierMinor}
              prefix="From "
              className="text-body font-medium text-text-primary"
              numberOfLines={1}
              waitingWidth="w-20"
            />
            <Text className="text-right text-caption text-text-secondary" numberOfLines={2}>
              {money.unit}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/**
 * Two lines of room for the name, whether or not the name needs them.
 *
 * These cards stand side by side — in a row on the wall, in a strip on Home —
 * and the only part of them that changes height is the name. Left to size
 * itself, "Flyers" made a card one line shorter than "Corporate giveaways"
 * beside it, so the two prices sat at different heights and the bottom edges
 * were ragged.
 *
 * Android ignores `minHeight` on `Text` (it sizes to the glyphs, then the
 * next line stacks against that). A wrapping name also grows past the token
 * line-height because Android adds font padding. So the reservations are
 * `View`s with a fixed `height`, and the text inside has font padding off.
 *
 * The block under the photo is reserved as well as the name, because a
 * subcategory without an example line, or a listing with no price, would drop
 * a line and start the ragged edge again.
 *
 * **The reservation is in the phone's text size, not in the design's.** React
 * Native multiplies both `fontSize` and `lineHeight` by the OS font scale, and
 * these boxes were raw numbers that did not move with it — so a client who had
 * turned text up got "per pack of 100" sliced through the middle and the second
 * line of a wrapped name shaved off, while the same card is perfect at 1x. The
 * clip is a guard against a tight line-box painting into the photo above, and
 * it must never be what decides how much of a sentence a person reads.
 */
const NAME_LINES = 2;
const EXAMPLE_LINES = 2;

/**
 * The card's reserved slots at this phone's text size.
 *
 * Never scales below 1: a client who has turned text *down* gets the design's
 * rhythm rather than a card squeezed tighter than it was drawn.
 */
export function sampleCardSlots(fontScale: number, withExamples: boolean) {
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const name = typography.body.lineHeight * NAME_LINES * scale;
  const examples = withExamples ? typography.caption.lineHeight * EXAMPLE_LINES * scale : 0;
  const price = (typography.body.lineHeight + typography.caption.lineHeight) * scale;
  const gaps = spacing.xs * (withExamples ? 2 : 1);
  return { name, examples, price, copy: name + examples + price + gaps };
}

const textSlot = {
  includeFontPadding: false,
  fontSize: typography.body.fontSize,
  lineHeight: typography.body.lineHeight,
} as const;

const captionSlot = {
  includeFontPadding: false,
  fontSize: typography.caption.fontSize,
  lineHeight: typography.caption.lineHeight,
} as const;

/**
 * One thing GRIDGO can print, as a sample tile.
 *
 * The photo leads because that is what a client picks with. Under it, the name
 * and the starting price — the two facts that decide a tap.
 */
export function CategorySampleCard({
  subcategory,
  listing,
  onPress,
  photoRatio = "square",
  showExamples = true,
}: CardProps) {
  const { fontScale } = useWindowDimensions();
  const slots = sampleCardSlots(fontScale, showExamples);
  const rate = useServiceFeeRateBps();
  const money = moneyLine(listing, rate);

  return (
    <View className="overflow-hidden rounded-card border border-outline bg-surface">
      <SamplePhoto
        url={sampleUrl(listing)}
        altText={listing?.photos[0]?.altText ?? subcategory.name}
        emptyLabel="No sample"
        ratio={photoRatio}
      />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          money
            ? `${subcategory.name}, ${money.spoken} ${money.unit}`
            : subcategory.name
        }
        accessibilityHint="Finds GRIDGO's printer for this"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View className="px-3 pb-3">
          <View
            testID="sample-card-copy"
            style={{ height: slots.copy, gap: spacing.xs, overflow: "hidden" }}
          >
            <View
              testID="sample-card-name"
              style={{ height: slots.name, overflow: "hidden" }}
            >
              <Text
                className="font-medium text-text-primary"
                numberOfLines={NAME_LINES}
                style={textSlot}
              >
                {subcategory.name}
              </Text>
            </View>
            {showExamples ? (
              <View style={{ height: slots.examples, overflow: "hidden" }}>
                {subcategory.examples ? (
                  <Text
                    className="text-text-muted"
                    numberOfLines={EXAMPLE_LINES}
                    style={captionSlot}
                  >
                    {subcategory.examples}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <View style={{ height: slots.price, overflow: "hidden" }}>
              {money ? (
                <>
                  <GridgoPrice
                    supplierMinor={money.supplierMinor}
                    prefix="From "
                    className="text-text-primary"
                    style={textSlot}
                    numberOfLines={1}
                    waitingWidth="w-20"
                  />
                  <Text className="text-text-muted" numberOfLines={1} style={captionSlot}>
                    {money.unit}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}
