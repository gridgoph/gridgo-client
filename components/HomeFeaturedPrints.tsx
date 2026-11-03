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
const HEADING_GAP = 8;
/** The heading row is as tall as its "See all" touch target (`gg-touch`). */
const HEADING_HEIGHT = 44;
/**
 * The shortest a small tile may get: the price tag (24) inset 6 from the top,
 * then the name (24) and unit line (16) inside 6 above and below. Below this
 * the tag would sit on the words.
 */
export const FEATURED_CARD_MIN_HEIGHT = 82;
/** The shortest the tiles get: two small tiles stacked. */
const GRID_MIN_HEIGHT = FEATURED_CARD_MIN_HEIGHT * 2 + GAP;
/** The shortest the whole block gets before Home would have to scroll. */
export const FEATURED_MIN_HEIGHT = HEADING_HEIGHT + HEADING_GAP + GRID_MIN_HEIGHT;

/**
 * FEATURED PRINTS as a still bento: the first card large, the next two
 * stacked beside it (gridgo-client, Mark's option 5).
 *
 * Nothing on it moves by itself. It used to be a snapping sideways pager in a
 * yellow block; every re-read re-measured the pager under the snap and the row
 * jumped on its own. Now there is no scroll view, no dots and no timer — the
 * tiles are flex boxes, so the block still takes whatever height Home has left
 * after its fixed rows and shrinks first on a small phone (client#335).
 *
 * It sits on the canvas like every other Home row. Yellow is spent only on the
 * price on each photo and the brand-coloured "See all".
 *
 * The products are the ones GRIDGO's staff curated (`GET /featured-prints`), at
 * GRIDGO's own starting price — never a shop's figure and never what other
 * clients are printing. Fewer than three cards change the shape
 * (`featuredShape`) rather than leaving holes.
 */
export function HomeFeaturedPrints({ samples, loading, onPick, onSeeAll, onStalePhoto }: Props) {
  const colors = useThemeColors();
  const waiting = loading && !samples.length;
  const shape = waiting ? "bento" : featuredShape(samples.length);

  const tile = (sample: HomeSample, size: TileSize) => (
    <FeaturedTile key={sample.id} sample={sample} size={size} onPress={() => onPick(sample)} onStalePhoto={onStalePhoto} />
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
          className="gg-touch -mr-2 flex-row items-center gap-1 px-2"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-brand underline">See all</Text>
          <ArrowRight size={16} color={colors.brand} strokeWidth={2.25} />
        </Pressable>
      </View>

      <View testID="featured-grid" className="flex-1 flex-row" style={{ marginTop: HEADING_GAP, gap: GAP }}>
        {waiting ? (
          <>
            <View className="flex-1" style={{ flexGrow: 1.15 }}>
              <SkeletonBlock className="h-full w-full rounded-card" />
            </View>
            <View testID="featured-waiting" className="flex-1" style={{ gap: GAP }}>
              <SkeletonBlock className="w-full flex-1 rounded-card" />
              <SkeletonBlock className="w-full flex-1 rounded-card" />
            </View>
          </>
        ) : shape === "single" ? (
          tile(samples[0], "large")
        ) : shape === "pair" ? (
          <>
            {tile(samples[0], "large")}
            {tile(samples[1], "large")}
          </>
        ) : shape === "bento" ? (
          <>
            <View testID="featured-lead" className="flex-1" style={{ flexGrow: 1.15 }}>
              {tile(samples[0], "large")}
            </View>
            <View testID="featured-stack" className="flex-1" style={{ gap: GAP }}>
              {tile(samples[1], "small")}
              {tile(samples[2], "small")}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

type TileSize = "large" | "small";

/** Twelve steps from clear to the label's shade, eased so no step shows. */
const FADE = Array.from({ length: 12 }, (_, step) => {
  const t = (step + 1) / 13;
  return photoLabel.shadeAlpha * t * t;
});

/** One curated print: its photo, with the name and starting price set on it. */
function FeaturedTile({
  sample,
  size,
  onPress,
  onStalePhoto,
}: {
  sample: HomeSample;
  size: TileSize;
  onPress: () => void;
  onStalePhoto?: () => Promise<unknown> | void;
}) {
  const photo = sample.photos[0];
  const unit = unitLine(sample);
  const rate = useServiceFeeRateBps();
  const large = size === "large";
  return (
    <Pressable
      testID={`featured-tile-${sample.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${sample.name}, from ${gridgoPriceLabel(null, rate, sample.clientFromPriceMinor)} ${unit}`}
      accessibilityHint="Finds GRIDGO's printer for this"
      className="flex-1 overflow-hidden rounded-card border border-outline bg-surface-variant"
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
    >
      <FeaturedPhoto
        url={samplePhotoUri(photo)}
        fileId={photo?.fileId ?? null}
        sampleId={sample.id}
        expiresAt={photo?.downloadUrlExpiresAt}
        onStale={onStalePhoto}
      />
      {/*
        The starting price as a tag in the corner, so the name and unit below
        get the tile's whole width — "per pack of 100" never clips.
      */}
      <View pointerEvents="none" className="absolute right-1.5 top-1.5 rounded-pill bg-action-yellow px-2.5 py-0.5">
        <GridgoPrice
          clientMinor={sample.clientFromPriceMinor}
          className={large ? "text-body-lg font-bold text-action-yellow-on" : "text-body font-bold text-action-yellow-on"}
          numberOfLines={1}
          waitingWidth="w-14"
        />
      </View>
      <View pointerEvents="none" className="absolute inset-x-0 bottom-0">
        {/* A smooth fade into the shade, so the words never sit on a hard band. */}
        {FADE.map((alpha) => (
          <View key={alpha} style={{ height: large ? 3 : 2, backgroundColor: photoShade(alpha) }} />
        ))}
        <View
          className={large ? "px-3 pb-3 pt-1" : "px-2.5 pb-1.5"}
          style={{ backgroundColor: photoShade(photoLabel.shadeAlpha) }}
        >
          <Text
            className={large ? "text-h3 font-bold" : "text-body-lg font-bold"}
            style={{ color: photoLabel.ink }}
            numberOfLines={large ? 2 : 1}
          >
            {sample.name}
          </Text>
          <Text className="text-caption" style={{ color: photoLabel.inkMuted }} numberOfLines={1}>
            from · {unit}
          </Text>
        </View>
      </View>
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
