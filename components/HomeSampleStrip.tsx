import { ScrollView, View, useWindowDimensions } from "react-native";

import { CategorySampleCard, sampleCardSlots } from "@/components/CategorySample";
import { SkeletonBlock } from "@/components/Skeleton";
import { pagePadding, spacing } from "@/constants/theme";
import {
  SAMPLE_GAP,
  homeSampleCardWidth,
  homeSamplePhotoHeight,
  type HomeSample,
} from "@/lib/homeSamples";

type Props = {
  samples: HomeSample[];
  /** True while the boards are still being read. Draws placeholder cards. */
  loading: boolean;
  onPick: (sample: HomeSample) => void;
};

/**
 * Work GRIDGO has actually printed, on a client's first screen.
 *
 * A Home with nothing on press was a category menu and a search bar: it asked
 * a brand-new client what they wanted without ever showing them one thing the
 * platform makes. This is the answer to that — the shops' own sample
 * photographs at their real starting prices, which is also the fastest route
 * into an order, since a tap goes straight to the job rather than through two
 * levels of menu.
 *
 * It is the same `CategorySampleCard` the category screen draws, deliberately:
 * a client who taps into a family should recognise the cards there as the ones
 * they just scrolled past. No shop is named on either — GRIDGO is the counter,
 * and matching decides the press later (`lib/gridgoOffice.ts`).
 *
 * Two things are cut differently here than on the wall, and both are because
 * this is a shelf rather than a page.
 *
 * **The photo is 4:3, not square.** A square sample at strip width made a card
 * three hundred points tall, which pushed the start board off the bottom of the
 * screen — the thing a client with nothing on press actually needs. Landscape
 * is also how these samples are shot.
 *
 * **The contents line is left off.** "Single sheets, event promos, product
 * announcements" cannot be set in two caption lines at this width, so it broke
 * mid-item — and the board below already lists what is in each family. A
 * photograph, what it is, and what it starts at is the whole card.
 *
 * The width is measured from the screen rather than fixed, so the card after
 * next always hangs over the edge; that overhang is what says the shelf runs
 * on, without a control that has to be explained.
 */
export function HomeSampleStrip({ samples, loading, onPick }: Props) {
  const { width, fontScale } = useWindowDimensions();
  const cardWidth = homeSampleCardWidth(width);
  // A placeholder shaped like the card it becomes. A wrong height here is the
  // jump a client sees when the boards land.
  // The crop-mark frame's gutter sits outside the photo, so the photo is cut
  // from what is left of the card's width.
  const placeholderHeight =
    homeSamplePhotoHeight(cardWidth - spacing.sm * 2) +
    spacing.sm * 2 +
    sampleCardSlots(fontScale, false).copy +
    spacing.md;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Bleeds through the 16px page padding and puts it back inside, so the
      // first card lines up with the column and the last one runs off the edge
      // instead of stopping short of it.
      className="-mx-4"
      contentContainerStyle={{ paddingHorizontal: pagePadding, gap: SAMPLE_GAP }}
      decelerationRate="fast"
      // Lands each card against the page's own left edge, so the shelf never
      // rests with a sample half off the screen.
      snapToInterval={cardWidth + SAMPLE_GAP}
      snapToAlignment="start"
    >
      {loading
        ? [0, 1, 2].map((key) => (
            <View key={key} style={{ width: cardWidth, height: placeholderHeight }}>
              <SkeletonBlock className="h-full w-full rounded-card" />
            </View>
          ))
        : samples.map((sample) => (
            <View key={sample.listing.id} style={{ width: cardWidth }}>
              <CategorySampleCard
                subcategory={sample.subcategory}
                listing={sample.listing}
                photoRatio="wide"
                showExamples={false}
                onPress={() => onPick(sample)}
              />
            </View>
          ))}
    </ScrollView>
  );
}
