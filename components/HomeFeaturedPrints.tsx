import { Image } from "expo-image";
import { ArrowRight, Image as ImageIcon } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { GridgoPrice, gridgoPriceLabel } from "@/components/GridgoPrice";
import { SkeletonBlock } from "@/components/Skeleton";
import { photoLabel, photoShade } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";
import { featuredShape, type HomeSample } from "@/lib/homeSamples";
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

/** The gap between tiles, and between the heading row and the tiles. */
const GAP = 12;
const HEADING_GAP = 6;
/** Compact visual row height; "See all" keeps its full 44pt `gg-touch` target via `-my-1`. */
const HEADING_HEIGHT = 36;

/**
 * Base 1.0x floor for one symmetric Featured Prints card: top price pill plus
 * the two-line title + unit band in normal flex flow, leaving room to compact
 * on a short 360x740 phone while growing naturally with larger text.
 */
export const FEATURED_CARD_MIN_HEIGHT = 96;
export const FEATURED_TITLE_MIN_HEIGHT = 40;

export function sharedFeaturedTitleHeight(heights: readonly number[]): number {
  return Math.max(FEATURED_TITLE_MIN_HEIGHT, ...heights.map((height) => Math.ceil(height)));
}

/** Base 1.0x floor for the whole Featured Prints section. */
export const FEATURED_MIN_HEIGHT = HEADING_HEIGHT + HEADING_GAP + FEATURED_CARD_MIN_HEIGHT;

/**
 * FEATURED PRINTS as a balanced two-column grid on Home's centre axis: equal
 * card widths and heights, aligned price badges and title bands, and full
 * wrapped product names with no ellipsis truncation.
 *
 * Nothing on it moves by itself — no scroll view, no dots and no timer — and
 * the block still takes whatever height Home has left after its fixed rows and
 * shrinks first on a small phone (client#335).
 *
 * The products are the ones GRIDGO's staff curated (`GET /featured-prints`), at
 * GRIDGO's own starting price — never a shop's figure and never what other
 * clients are printing.
 */
export function HomeFeaturedPrints({ samples, loading, onPick, onSeeAll, onStalePhoto }: Props) {
  const colors = useThemeColors();
  const waiting = loading && !samples.length;
  const shape = waiting ? "pair" : featuredShape(samples.length);
  const visible = shape === "single" ? samples.slice(0, 1) : shape === "pair" ? samples.slice(0, 2) : [];
  const [titleHeights, setTitleHeights] = useState<Record<string, number>>({});
  const sharedTitleMinHeight = sharedFeaturedTitleHeight(
    visible.map((sample) => titleHeights[sample.id] ?? 0),
  );

  const column = (sample: HomeSample) => (
    <View key={sample.id} testID={`featured-col-${sample.id}`} className="flex-1" style={{ minWidth: 0, flexBasis: 0 }}>
      <FeaturedTile
        sample={sample}
        titleMinHeight={sharedTitleMinHeight}
        onTitleHeight={(height) =>
          setTitleHeights((prev) => (prev[sample.id] === height ? prev : { ...prev, [sample.id]: height }))
        }
        onPress={() => onPick(sample)}
        onStalePhoto={onStalePhoto}
      />
    </View>
  );

  return (
    <View testID="featured-prints" className="flex-1" style={{ minHeight: FEATURED_MIN_HEIGHT }}>
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

      <View testID="featured-grid" className="flex-1 flex-row items-stretch" style={{ marginTop: HEADING_GAP, gap: GAP }}>
        {waiting ? (
          <View testID="featured-waiting" className="flex-1 flex-row items-stretch" style={{ gap: GAP }}>
            <View className="flex-1" style={{ minWidth: 0, flexBasis: 0, minHeight: FEATURED_CARD_MIN_HEIGHT }}>
              <SkeletonBlock className="h-full w-full rounded-card" />
            </View>
            <View className="flex-1" style={{ minWidth: 0, flexBasis: 0, minHeight: FEATURED_CARD_MIN_HEIGHT }}>
              <SkeletonBlock className="h-full w-full rounded-card" />
            </View>
          </View>
        ) : (
          visible.map(column)
        )}
      </View>
    </View>
  );
}

/** Twelve steps from clear to the label's shade, eased so no step shows. */
const FADE = Array.from({ length: 12 }, (_, step) => {
  const t = (step + 1) / 13;
  return photoLabel.shadeAlpha * t * t;
});

/** One curated print: its photo, with aligned starting price and wrapped title. */
function FeaturedTile({
  sample,
  titleMinHeight,
  onTitleHeight,
  onPress,
  onStalePhoto,
}: {
  sample: HomeSample;
  titleMinHeight: number;
  onTitleHeight: (height: number) => void;
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
      className="w-full grow overflow-hidden rounded-card border border-outline bg-surface-variant"
      style={{ minHeight: FEATURED_CARD_MIN_HEIGHT, minWidth: 0 }}
    >
      {({ pressed }) => (
        <>
          <FeaturedPhoto
            url={samplePhotoUri(photo)}
            fileId={photo?.fileId ?? null}
            sampleId={sample.id}
            expiresAt={photo?.downloadUrlExpiresAt}
            onStale={onStalePhoto}
          />
          <View pointerEvents="none" className="grow justify-between">
            <View className="items-end px-2 pt-2">
              <View testID={`featured-price-badge-${sample.id}`} className="rounded-pill bg-action-yellow px-2.5 py-0.5">
                <GridgoPrice
                  clientMinor={sample.clientFromPriceMinor}
                  className="text-body font-bold text-action-yellow-on"
                  numberOfLines={1}
                  waitingWidth="w-14"
                />
              </View>
            </View>
            <View className="relative">
              {/* A smooth fade into the shade above the band, without taking flex height on short phones. */}
              <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: "100%" }}>
                {FADE.map((alpha) => (
                  <View key={alpha} style={{ height: 1.5, backgroundColor: photoShade(alpha) }} />
                ))}
              </View>
              <View
                className="gap-0.5 px-2.5 pb-2 pt-0.5"
                style={{ backgroundColor: photoShade(photoLabel.shadeAlpha) }}
              >
                <View
                  testID={`featured-title-slot-${sample.id}`}
                  className="justify-start"
                  style={{ minHeight: titleMinHeight }}
                >
                  <Text
                    testID={`featured-title-${sample.id}`}
                    className="text-body font-bold"
                    style={{ color: photoLabel.ink }}
                    onLayout={(event) => {
                      const next = Math.ceil(event.nativeEvent.layout.height);
                      if (next > 0) onTitleHeight(next);
                    }}
                  >
                    {sample.name}
                  </Text>
                </View>
                <Text className="text-caption" style={{ color: photoLabel.inkMuted, lineHeight: 18 }}>
                  from · {unit}
                </Text>
              </View>
            </View>
          </View>
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * The sample photo, filling the tile.
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
      <View className="absolute inset-0 items-center justify-center pb-10">
        <ImageIcon size={22} color={colors.textMuted} strokeWidth={1.75} />
      </View>
    );
  }
  return (
    <Image
      testID="sample-photo-image"
      source={source}
      recyclingKey={sampleId}
      cachePolicy="memory-disk"
      contentFit="cover"
      accessibilityIgnoresInvertColors
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      onError={() => {
        setFailed(url);
        if (photoLinkIsStale({ downloadUrlExpiresAt: expiresAt })) ask();
      }}
    />
  );
}
