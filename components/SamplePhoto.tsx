import { ImageOff, Image as ImageIcon } from "lucide-react-native";
import { useState } from "react";
import { Image, Text, View } from "react-native";

import { CropMarkFrame } from "@/components/CropMarkFrame";
import { SkeletonBlock } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /**
   * The signed link that came with the listing. Short-lived by design — the
   * board is re-read on focus, which is what refreshes it.
   */
  url?: string | null;
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
 * A photo that will not load says so in words. GRIDGO signs these links against
 * its own storage, and a deployment whose storage is only reachable from the
 * machine running it will refuse them on a phone — an empty grey square would
 * read as a shop with nothing to show, which is a different and much worse
 * thing than a link that expired.
 */
export function SamplePhoto({
  url,
  altText,
  ratio = "square",
  gutter = "standard",
  emptyLabel,
}: Props) {
  const colors = useThemeColors();
  // The failure is remembered against the url that failed, so a different
  // sample in the same frame starts clean rather than inheriting a refusal.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl !== null && failedUrl === url;

  // Native aspectRatio, not `aspect-[4/3]`: that arbitrary class has shipped as
  // a silent no-op in this pipeline before, and a frame with no ratio collapses.
  const aspectRatio = ratio === "wide" ? 4 / 3 : 1;

  return (
    <CropMarkFrame gutter={gutter}>
      <View className="w-full" style={{ aspectRatio }}>
        {url && !failed ? (
          <View collapsable={false} style={{ width: "100%", height: "100%" }}>
            <Image
              source={{ uri: url }}
              accessibilityLabel={altText || "Sample photo"}
              resizeMode="cover"
              style={{ width: "100%", height: "100%" }}
              onError={() => setFailedUrl(url ?? null)}
            />
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
