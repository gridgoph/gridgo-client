import { ImageOff, Image as ImageIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { CropMarkFrame } from "@/components/CropMarkFrame";
import { SamplePhotoViewer } from "@/components/SamplePhotoViewer";
import { SkeletonBlock } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import { photoLinkIsStale } from "@/lib/photoLinks";

type Props = {
  /**
   * The signed link that came with the listing. Short-lived by design: it
   * expires at `expiresAt`, and the screen holding it re-reads for a new one.
   */
  url?: string | null;
  /** The link's `downloadUrlExpiresAt`, when the payload carried one. */
  expiresAt?: string | null;
  /**
   * Asks the screen holding the listing for a fresh read, because this link has
   * expired (`hooks/usePhotoLinkRefresh.ts`). Called at most once per link.
   * Without it an expired link fails like any other.
   */
  onStale?: () => Promise<unknown> | void;
  /** What the sample shows, for anyone who cannot see it. */
  altText?: string | null;
  /** Square on a list row, wider on a sheet header. */
  ratio?: "square" | "wide";
  gutter?: "tight" | "standard";
  /** What an empty frame says. A blank plate reads as a broken listing. */
  emptyLabel?: string;
};

/**
 * A shop's own sample, trimmed to crop marks.
 *
 * This is the shop's photograph of work it has actually printed, not a stock
 * product tile, and the crop-mark frame is what says so — register marks are
 * what a printer trims to, and the same frame is drawn on the shop's side of
 * the counter in gridgo-supplier. Keeping the two identical is the point: a
 * client and a shop are looking at the same board.
 *
 * **An expired link is not a broken photo.** GRIDGO signs these links for five
 * minutes, and a phone left in the background holds them far longer. When the
 * link is already stale, or the photo fails on a link past its expiry, the tile
 * asks its screen for a fresh read (`onStale`) and shimmers while it waits —
 * the same sweep the tile showed while the board was first read — rather than
 * telling the client the photo is gone. It asks once per link: if the re-read
 * cannot replace the link, the failure is real and is said.
 *
 * A photo that will not load on a good link says so in words. A deployment
 * whose storage is only reachable from the machine running it will refuse
 * these links on a phone — an empty grey square would read as a shop with
 * nothing to show, which is a different and much worse thing.
 *
 * A stored photo is a press: the tile stays the board, and the loupe is a
 * full-screen pinch so a client can read the print rather than the thumbnail.
 */
export function SamplePhoto({
  url,
  expiresAt,
  onStale,
  altText,
  ratio = "square",
  gutter = "standard",
  emptyLabel,
}: Props) {
  const colors = useThemeColors();
  // Everything below is remembered against the url it happened to, so a new
  // link in the same frame starts clean rather than inheriting a refusal.
  const [failure, setFailure] = useState<{ url: string; expired: boolean } | null>(null);
  // The screen answered a re-read for this url and still handed it back.
  const [rereadFor, setRereadFor] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const askedFor = useRef<string | null>(null);
  const [open, setOpen] = useState(false);

  const askForFreshLink = (stale: string) => {
    if (!onStale || askedFor.current === stale) return;
    askedFor.current = stale;
    const settle = () => setRereadFor(stale);
    Promise.resolve()
      .then(onStale)
      .then(settle, settle);
  };

  // A link already past its expiry is refreshed before anyone sees it fail.
  useEffect(() => {
    if (url && onStale && photoLinkIsStale({ downloadUrlExpiresAt: expiresAt })) {
      askForFreshLink(url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Asking is keyed by the link; a new callback identity is not a new link.
  }, [url, expiresAt]);

  const onImageError = () => {
    if (!url) return;
    const expired =
      Boolean(onStale) && photoLinkIsStale({ downloadUrlExpiresAt: expiresAt });
    setFailure({ url, expired });
    if (expired) askForFreshLink(url);
  };

  const failedHere = failure !== null && failure.url === url;
  // Waiting on a fresh link: shimmer, never the failure text.
  const refreshing = failedHere && failure.expired && rereadFor !== url;
  const failed = failedHere && !refreshing;
  const alt = altText || "Sample photo";
  const canOpen = Boolean(url && !failedHere);

  // Native aspectRatio, not `aspect-[4/3]`: that arbitrary class has shipped as
  // a silent no-op in this pipeline before, and a frame with no ratio collapses.
  const aspectRatio = ratio === "wide" ? 4 / 3 : 1;

  return (
    <CropMarkFrame gutter={gutter}>
      <View className="w-full" style={{ aspectRatio }}>
        {url && !failedHere ? (
          <View collapsable={false} style={{ width: "100%", height: "100%" }}>
            {/* The sweep sits under the photo until it has painted, so a slow
                photo on mobile data reads as arriving rather than missing. */}
            {loadedUrl !== url ? (
              <View pointerEvents="none" className="absolute inset-0">
                <SkeletonBlock className="h-full w-full" />
              </View>
            ) : null}
            <Pressable
              onPress={() => setOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${alt} larger`}
              accessibilityHint="Opens the sample full screen so you can pinch to zoom"
              style={{ width: "100%", height: "100%" }}
            >
              <Image
                testID="sample-photo-image"
                source={{ uri: url }}
                accessibilityLabel={alt}
                resizeMode="cover"
                style={{ width: "100%", height: "100%" }}
                onLoad={() => setLoadedUrl(url)}
                onError={onImageError}
              />
            </Pressable>
            {canOpen ? (
              <SamplePhotoViewer
                uri={url}
                alt={alt}
                open={open}
                onClose={() => setOpen(false)}
              />
            ) : null}
          </View>
        ) : refreshing ? (
          <View
            testID="sample-photo-refreshing"
            accessible
            accessibilityLabel={`${alt}, loading`}
            className="h-full w-full"
          >
            <SkeletonBlock className="h-full w-full" />
          </View>
        ) : failed ? (
          <View className="flex-1 items-center justify-center gap-1 p-3">
            <ImageOff size={18} color={colors.textMuted} strokeWidth={2} />
            <Text className="text-center text-caption text-text-muted">
              This photo will not load
            </Text>
          </View>
        ) : url === undefined ? (
          <SkeletonBlock className="h-full w-full" />
        ) : (
          <View className="flex-1 items-center justify-center gap-1 p-3">
            <ImageIcon size={18} color={colors.textMuted} strokeWidth={2} />
            <Text className="text-center text-caption text-text-muted">
              {emptyLabel ?? "No sample"}
            </Text>
          </View>
        )}
      </View>
    </CropMarkFrame>
  );
}
