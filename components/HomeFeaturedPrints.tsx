import { ArrowRight, Image as ImageIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";

import { GridgoPrice, gridgoPriceLabel } from "@/components/GridgoPrice";
import { SkeletonBlock } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import type { HomeSample } from "@/lib/homeSamples";
import { samplePhotoUri, unitLine } from "@/lib/listing";
import { photoLinkIsStale } from "@/lib/photoLinks";
import { useServiceFeeRateBps } from "@/store/platformSettings";

type Props = {
  samples: HomeSample[];
  loading: boolean;
  onPick: (sample: HomeSample) => void;
  onSeeAll: () => void;
  /** Home's re-read for an expired photo link. */
  onStalePhoto?: () => Promise<unknown> | void;
};

const GAP = 12;
/** How much of the next card stays in view: the cut edge that says "swipe". */
const PEEK = 36;
const PAD = 16;

/**
 * FEATURED PRINTS as one yellow block that swipes sideways (client#335).
 *
 * It is the one part of Home that flexes: the block takes whatever height the
 * screen has left after the fixed rows, so on a small phone it shrinks first
 * and the categories and tiles stay put. The products are the ones GRIDGO's
 * staff curated (`GET /featured-prints`), at GRIDGO's own starting price —
 * never a shop's figure and never what other clients are printing.
 *
 * The block is yellow in both themes, so everything drawn straight on it is
 * set in `action-yellow-on` ink, never a theme text token.
 */
export function HomeFeaturedPrints({ samples, loading, onPick, onSeeAll, onStalePhoto }: Props) {
  const ink = useThemeColors().actionYellowOn;
  const window = useWindowDimensions();
  // Measured on layout; until then a phone-shaped guess, so the cards paint
  // on the first frame rather than popping in.
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const box = measured ?? { width: Math.max(200, window.width - 4 * PAD), height: 260 };
  const [page, setPage] = useState(0);
  const cardWidth = Math.max(160, box.width - PEEK);
  const count = loading && !samples.length ? 3 : samples.length;

  const onPagerLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMeasured((current) => (current && current.width === width && current.height === height ? current : { width, height }));
  };

  return (
    <View testID="featured-prints" className="flex-1 rounded-card bg-action-yellow" style={{ paddingTop: PAD, minHeight: 236 }}>
      <View className="flex-row items-center justify-between" style={{ paddingHorizontal: PAD }}>
        <Text className="text-h2 text-action-yellow-on" accessibilityRole="header">
          Featured prints
        </Text>
        <DotMark />
      </View>

      <View className="mt-3 flex-1" onLayout={onPagerLayout} style={{ marginHorizontal: PAD }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -PAD }}
          contentContainerStyle={{ paddingHorizontal: PAD, gap: GAP }}
          decelerationRate="fast"
          snapToInterval={cardWidth + GAP}
          snapToAlignment="start"
          scrollEventThrottle={32}
          onScroll={(event) => {
            const next = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + GAP));
            if (next !== page) setPage(Math.max(0, Math.min(count - 1, next)));
          }}
        >
          {loading && !samples.length
            ? [0, 1, 2].map((key) => (
                <View key={key} style={{ width: cardWidth, height: box.height }}>
                  <SkeletonBlock className="h-full w-full rounded-card" />
                </View>
              ))
            : samples.map((sample) => (
                <FeaturedCard
                  key={sample.id}
                  sample={sample}
                  width={cardWidth}
                  height={box.height}
                  onPress={() => onPick(sample)}
                  onStalePhoto={onStalePhoto}
                />
              ))}
          </ScrollView>
      </View>

      <View className="flex-row items-center justify-between" style={{ paddingLeft: PAD, paddingRight: 4 }}>
        <PageDots count={count} page={page} />
        <Pressable
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel="See all prints"
          className="gg-touch flex-row items-center gap-1 px-3"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-action-yellow-on underline">See all</Text>
          <ArrowRight size={16} color={ink} strokeWidth={2.25} />
        </Pressable>
      </View>
    </View>
  );
}

function FeaturedCard({
  sample,
  width,
  height,
  onPress,
  onStalePhoto,
}: {
  sample: HomeSample;
  width: number;
  height: number;
  onPress: () => void;
  onStalePhoto?: () => Promise<unknown> | void;
}) {
  const photo = sample.photos[0];
  const unit = unitLine(sample);
  const rate = useServiceFeeRateBps();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${sample.name}, from ${gridgoPriceLabel(null, rate, sample.clientFromPriceMinor)} ${unit}`}
      accessibilityHint="Finds GRIDGO's printer for this"
      className="overflow-hidden rounded-card bg-surface p-2"
      style={({ pressed }) => [{ width, height }, pressed ? { opacity: 0.8 } : null]}
    >
      <View className="flex-1 overflow-hidden rounded-field bg-surface-variant">
        <FeaturedPhoto url={samplePhotoUri(photo)} expiresAt={photo?.downloadUrlExpiresAt} onStale={onStalePhoto} />
      </View>
      <View className="flex-row items-end gap-2 px-1 pb-1 pt-2">
        <View className="min-w-0 flex-1">
          <Text className="text-body-lg font-bold text-text-primary" numberOfLines={1}>
            {sample.name}
          </Text>
          <Text className="text-caption text-text-secondary" numberOfLines={1}>
            from · {unit}
          </Text>
        </View>
        <View className="rounded-field bg-action-yellow px-2.5 py-1">
          <GridgoPrice
            clientMinor={sample.clientFromPriceMinor}
            className="text-body-lg font-bold text-action-yellow-on"
            numberOfLines={1}
            waitingWidth="w-16"
          />
        </View>
      </View>
    </Pressable>
  );
}

/** The sample photo, filling whatever height the card has. */
function FeaturedPhoto({
  url,
  expiresAt,
  onStale,
}: {
  url: string | null;
  expiresAt?: string | null;
  onStale?: () => Promise<unknown> | void;
}) {
  const colors = useThemeColors();
  const [failed, setFailed] = useState<string | null>(null);
  const asked = useRef<string | null>(null);
  const ask = () => {
    if (!url || !onStale || asked.current === url) return;
    asked.current = url;
    void Promise.resolve().then(onStale).catch(() => {});
  };
  useEffect(() => {
    if (url && photoLinkIsStale({ downloadUrlExpiresAt: expiresAt })) ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the link
  }, [url, expiresAt]);

  if (!url || failed === url) {
    return (
      <View className="flex-1 items-center justify-center">
        <ImageIcon size={22} color={colors.textMuted} strokeWidth={1.75} />
      </View>
    );
  }
  return (
    <Image
      testID="sample-photo-image"
      source={{ uri: url }}
      resizeMode="cover"
      resizeMethod="resize"
      accessibilityIgnoresInvertColors
      style={{ width: "100%", height: "100%" }}
      onError={() => {
        setFailed(url);
        if (photoLinkIsStale({ downloadUrlExpiresAt: expiresAt })) ask();
      }}
    />
  );
}

/** Where the swipe stands. Read by eye only: the cards themselves are the controls. */
function PageDots({ count, page }: { count: number; page: number }) {
  const ink = useThemeColors().actionYellowOn;
  if (count < 2) return <View />;
  return (
    <View className="flex-row items-center gap-1.5" aria-hidden>
      {Array.from({ length: Math.min(count, 8) }, (_, index) => (
        <View
          key={index}
          style={{
            height: 6,
            width: index === page ? 20 : 6,
            borderRadius: 3,
            backgroundColor: ink,
            opacity: index === page ? 1 : 0.35,
          }}
        />
      ))}
    </View>
  );
}

/** The GRIDGO grid, quietly, in the block's corner. Decoration only. */
function DotMark() {
  const ink = useThemeColors().actionYellowOn;
  return (
    <View className="flex-row flex-wrap" style={{ width: 30, gap: 3 }} aria-hidden>
      {Array.from({ length: 9 }, (_, index) => (
        <View key={index} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ink, opacity: 0.12 }} />
      ))}
    </View>
  );
}
