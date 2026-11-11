import { Image } from "expo-image";
import { ArrowRight, Image as ImageIcon } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, Text, View, useWindowDimensions, type ListRenderItem } from "react-native";

import { GridgoPrice, gridgoPriceLabel } from "@/components/GridgoPrice";
import { SkeletonBlock } from "@/components/Skeleton";
import { pagePadding } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";
import {
  FEATURED_GAP,
  featuredCardWidth,
  featuredImageHeight,
  featuredSnapInterval,
  type HomeSample,
} from "@/lib/homeSamples";
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

/** The heading row, and the space between it and the cards. */
const HEADING_HEIGHT = 36;
const HEADING_GAP = 6;
/** Skeleton cards while the first read is out: two and the cut third. */
const WAITING_CARDS = 3;

/**
 * The row bleeds to both screen edges and pads itself back in, so the first
 * card starts on Home's page padding and the last ends the same distance from
 * the right edge.
 */
const BLEED = { marginHorizontal: -pagePadding } as const;
const ROW_INSET = { paddingHorizontal: pagePadding, gap: FEATURED_GAP } as const;

/**
 * FEATURED PRINTS as a horizontal peek carousel: every product GRIDGO's staff
 * curated (`GET /featured-prints`), in their order, as uniform 3:4 portrait
 * cards with the name and starting price under the photo. About 2.3 cards
 * show at rest, so the cut third says there is more; the row snaps card by
 * card and nothing moves by itself — no timer and no page dots.
 *
 * The block takes its own height and grows into whatever Home has left, so
 * larger text pushes Home down rather than clipping the cards (client#335).
 *
 * Prices are GRIDGO's own starting price — never a shop's figure and never
 * what other clients are printing.
 */
export function HomeFeaturedPrints({ samples, loading, onPick, onSeeAll, onStalePhoto }: Props) {
  const colors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = featuredCardWidth(screenWidth);
  const imageHeight = featuredImageHeight(cardWidth);
  const interval = featuredSnapInterval(cardWidth);
  const waiting = loading && !samples.length;

  const renderItem = useCallback<ListRenderItem<HomeSample>>(
    ({ item }) => (
      <FeaturedCard
        sample={item}
        width={cardWidth}
        imageHeight={imageHeight}
        onPress={() => onPick(item)}
        onStalePhoto={onStalePhoto}
      />
    ),
    [cardWidth, imageHeight, onPick, onStalePhoto],
  );
  const getItemLayout = useCallback(
    (_: ArrayLike<HomeSample> | null | undefined, index: number) => ({
      length: cardWidth,
      offset: pagePadding + index * interval,
      index,
    }),
    [cardWidth, interval],
  );

  return (
    <View testID="featured-prints" style={{ flexGrow: 1, flexShrink: 0 }}>
      <View className="flex-row items-center justify-between" style={{ minHeight: HEADING_HEIGHT }}>
        <Text className="text-h2 text-text-primary" accessibilityRole="header">
          Featured prints
        </Text>
        <Pressable
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel="See all prints"
          className="gg-touch -my-1 -mr-2 flex-row items-center gap-1 px-2"
        >
          {({ pressed }) => (
            <View className="flex-row items-center gap-1" style={pressed ? { opacity: 0.6 } : undefined}>
              <Text className="text-button text-brand underline">See all</Text>
              <ArrowRight size={16} color={colors.brand} strokeWidth={2.25} />
            </View>
          )}
        </Pressable>
      </View>

      <View style={{ marginTop: HEADING_GAP }}>
        {waiting ? (
          <View testID="featured-waiting" className="flex-row overflow-hidden" style={[BLEED, ROW_INSET]}>
            {Array.from({ length: WAITING_CARDS }, (_, index) => (
              <WaitingCard key={index} width={cardWidth} imageHeight={imageHeight} />
            ))}
          </View>
        ) : (
          <FlatList
            testID="featured-row"
            horizontal
            data={samples}
            keyExtractor={(sample) => sample.id}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            showsHorizontalScrollIndicator={false}
            snapToInterval={interval}
            snapToAlignment="start"
            decelerationRate="fast"
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={5}
            style={[BLEED, { flexGrow: 0 }]}
            contentContainerStyle={ROW_INSET}
          />
        )}
      </View>
    </View>
  );
}

/** One curated print: its 3:4 photo, then the name and starting price under it. */
function FeaturedCard({
  sample,
  width,
  imageHeight,
  onPress,
  onStalePhoto,
}: {
  sample: HomeSample;
  width: number;
  imageHeight: number;
  onPress: () => void;
  onStalePhoto?: () => Promise<unknown> | void;
}) {
  const photo = sample.photos[0];
  const unit = unitLine(sample);
  const rate = useServiceFeeRateBps();
  return (
    <Pressable
      testID={`featured-tile-${sample.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${sample.name}, from ${gridgoPriceLabel(null, rate, sample.clientFromPriceMinor)} ${unit}`}
      accessibilityHint="Finds GRIDGO's printer for this"
      style={{ width }}
    >
      {({ pressed }) => (
        <View style={pressed ? { opacity: 0.7 } : undefined}>
          <View
            testID={`featured-image-${sample.id}`}
            className="overflow-hidden rounded-card border border-outline bg-surface-variant"
            style={{ width, height: imageHeight }}
          >
            <FeaturedPhoto
              url={samplePhotoUri(photo)}
              fileId={photo?.fileId ?? null}
              sampleId={sample.id}
              expiresAt={photo?.downloadUrlExpiresAt}
              onStale={onStalePhoto}
            />
          </View>
          <View pointerEvents="none" className="mt-2 gap-0.5">
            <Text
              testID={`featured-title-${sample.id}`}
              className="text-body font-bold text-text-primary"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {sample.name}
            </Text>
            <GridgoPrice
              clientMinor={sample.clientFromPriceMinor}
              suffix={` ${unit}`}
              className="text-caption font-medium text-text-secondary"
              waitingWidth="w-20"
            />
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** The shape a card will take, held while the first read is out. */
function WaitingCard({ width, imageHeight }: { width: number; imageHeight: number }) {
  return (
    <View aria-hidden style={{ width }}>
      <View className="overflow-hidden rounded-card" style={{ width, height: imageHeight }}>
        <SkeletonBlock className="h-full w-full" />
      </View>
      {/* The text slots keep the line heights of the name and price they become. */}
      <View className="mt-2 gap-0.5">
        <View className="h-5 justify-center">
          <SkeletonBlock className="h-3.5 w-4/5" />
        </View>
        <View className="h-4 justify-center">
          <SkeletonBlock className="h-3 w-1/2" />
        </View>
      </View>
    </View>
  );
}

/**
 * The sample photo, filling its fixed 3:4 box: a sweeping placeholder until
 * it paints, and a quiet image glyph if there is none or it will not load.
 *
 * Cached by its file id, not its address: every read of `GET /featured-prints`
 * signs the link afresh, and keyed by address each re-read downloaded the same
 * photo again. A renewed link to the same file is a cache hit.
 */
function FeaturedPhoto({
  url,
  fileId,
  sampleId,
  expiresAt,
  onStale,
}: {
  url: string | null;
  fileId: string | null;
  sampleId: string;
  expiresAt?: string | null;
  onStale?: () => Promise<unknown> | void;
}) {
  const colors = useThemeColors();
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
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
  const source = useMemo(() => (url ? { uri: url, cacheKey: fileId ?? undefined } : null), [url, fileId]);

  if (!source || failed === url) {
    return (
      <View testID={`featured-photo-missing-${sampleId}`} className="absolute inset-0 items-center justify-center">
        <ImageIcon size={22} color={colors.textMuted} strokeWidth={1.75} />
      </View>
    );
  }
  return (
    <>
      {loaded === url ? null : (
        <View testID={`featured-photo-loading-${sampleId}`} className="absolute inset-0">
          <SkeletonBlock className="h-full w-full" />
        </View>
      )}
      <Image
        testID="sample-photo-image"
        source={source}
        recyclingKey={sampleId}
        cachePolicy="memory-disk"
        contentFit="cover"
        accessibilityIgnoresInvertColors
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        onLoad={() => setLoaded(url)}
        onError={() => {
          setFailed(url);
          if (photoLinkIsStale({ downloadUrlExpiresAt: expiresAt })) ask();
        }}
      />
    </>
  );
}
