import { Camera } from "lucide-react-native";
import { Text, View } from "react-native";

import { SamplePhoto } from "@/components/SamplePhoto";
import type { ProgressPhotoLink } from "@/hooks/useProductionPhotoLinks";
import { useThemeColors } from "@/hooks/useTheme";
import { WAITING_FOR_PHOTO } from "@/lib/productionProgress";
import { formatRelativeTime, formatTimelineStamp } from "@/lib/relativeTime";

/**
 * What the print shop has shown of the job while making it, drawn inside the
 * order's history under the step each photo was taken in (gridgo-client#129).
 *
 * Photos are trimmed to crop marks like the shops' own samples — it is the same
 * kind of thing, a photograph of real print — and every one opens full screen
 * from `SamplePhoto`. An expired or missing link is re-signed rather than shown
 * as broken; the links come from `useProductionPhotoLinks`, held once by the
 * docket so the thumbnail and the history share them.
 */
export function ProgressPhotoSheet({
  links,
  onStale,
}: {
  links: readonly ProgressPhotoLink[];
  onStale: () => Promise<void>;
}) {
  const rows = chunk(links, 3);
  if (!rows.length) return null;

  return (
    <View className="gap-2">
      {rows.map((row) => (
        <View key={row.map((link) => link?.fileId ?? "gap").join("|")} className="flex-row gap-1">
          {row.map((link, index) =>
            link ? (
              <View key={link.fileId} className="flex-1 gap-1">
                <SamplePhoto
                  url={link.url}
                  expiresAt={link.expiresAt}
                  onStale={onStale}
                  altText={photoAlt(link)}
                  gutter="tight"
                  emptyLabel="Will not load"
                />
                {link.at ? (
                  <Text className="px-1.5 text-caption text-text-muted" numberOfLines={1}>
                    {formatRelativeTime(link.at)}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View key={`gap-${index}`} className="flex-1" />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

/**
 * The honest lack of a photo. Not an alarm: a job being printed is the normal
 * case, so it carries no warning colour (gridgoph/gridgo-api#112).
 */
export function WaitingForPhoto({ body }: { body?: string }) {
  const colors = useThemeColors();
  return (
    <View
      className="flex-row items-start gap-2"
      accessible
      accessibilityLabel={body ? `${WAITING_FOR_PHOTO}. ${body}` : WAITING_FOR_PHOTO}
    >
      <View className="pt-0.5">
        <Camera size={16} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      </View>
      <Text className="flex-1 text-body text-text-secondary">{body ?? WAITING_FOR_PHOTO}</Text>
    </View>
  );
}

export function photoAlt(link: Pick<ProgressPhotoLink, "at">): string {
  return link.at ? `Progress photo, ${formatTimelineStamp(link.at)}` : "Progress photo";
}

/** Rows of `size`, the last padded with nulls so every cell keeps its width. */
function chunk<T>(items: readonly T[], size: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let index = 0; index < items.length; index += size) {
    const row: (T | null)[] = items.slice(index, index + size);
    while (row.length < size) row.push(null);
    rows.push(row);
  }
  return rows;
}
