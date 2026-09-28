import { Camera } from "lucide-react-native";
import { Text, View } from "react-native";

import { SamplePhoto } from "@/components/SamplePhoto";
import { useProductionPhotoLinks, type ProgressPhotoLink } from "@/hooks/useProductionPhotoLinks";
import { useThemeColors } from "@/hooks/useTheme";
import type { ProductionPhoto } from "@/lib/api";
import { WAITING_FOR_PHOTO, type ProgressView } from "@/lib/productionProgress";
import { formatRelativeTime, formatTimelineStamp } from "@/lib/relativeTime";

type Props = {
  /** `progressView(order)`; the screen draws nothing for null. */
  view: ProgressView;
};

const EMPTY: ProductionPhoto[] = [];

/**
 * What the print shop has shown of the job while making it.
 *
 * Two shapes. With photos, the newest is the lead, trimmed to crop marks like
 * the shops' own samples — it is the same kind of thing, a photograph of real
 * print — and any earlier ones sit under it as a contact sheet. Without, a
 * quiet line that says a photo is expected and has not come: the reported job
 * went from press to dispatch in a minute with nothing to show, and the client
 * could not tell (gridgoph/gridgo-api#112). The wait is not an alarm; a job
 * being printed is the normal case, so it carries no warning colour.
 *
 * Every photo opens full screen from `SamplePhoto`, and an expired or missing
 * link is re-signed rather than shown as broken (`useProductionPhotoLinks`).
 */
export function ProductionProgress({ view }: Props) {
  return (
    <View className="gap-4">
      <Text className="text-overline text-text-muted">PROGRESS</Text>
      {view.kind === "photos" ? (
        <PhotoGallery photos={view.photos} />
      ) : (
        <WaitingForPhoto body={view.body} />
      )}
    </View>
  );
}

function WaitingForPhoto({ body }: { body: string }) {
  const colors = useThemeColors();
  return (
    <View
      className="gg-card flex-row gap-3"
      accessible
      accessibilityLabel={`${WAITING_FOR_PHOTO}. ${body}`}
    >
      <View className="h-11 w-11 items-center justify-center rounded-pill bg-surface-variant">
        <Camera size={20} color={colors.textSecondary} strokeWidth={2} />
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-body-lg font-medium text-text-primary">{WAITING_FOR_PHOTO}</Text>
        <Text className="text-body text-text-secondary">{body}</Text>
      </View>
    </View>
  );
}

function PhotoGallery({ photos }: { photos: ProductionPhoto[] }) {
  const { links, onStale } = useProductionPhotoLinks(photos.length ? photos : EMPTY);
  const [latest, ...earlier] = links;
  const rows = chunk(earlier, 3);
  if (!latest) return null;

  return (
    <View className="gg-card gap-4">
      <View className="gap-2">
        <SamplePhoto
          url={latest.url}
          expiresAt={latest.expiresAt}
          onStale={onStale}
          altText={photoAlt(latest)}
          ratio="wide"
          emptyLabel="This photo will not load right now"
        />
        <View className="flex-row items-baseline justify-between gap-3 px-2">
          <Text className="text-body font-medium text-text-primary">Latest photo</Text>
          {latest.at ? (
            <Text className="shrink text-caption text-text-muted">
              {formatTimelineStamp(latest.at)} · {formatRelativeTime(latest.at)}
            </Text>
          ) : null}
        </View>
      </View>

      {rows.length ? (
        <View className="gap-2">
          <Text className="px-2 text-caption text-text-muted">
            {earlier.length === 1 ? "1 earlier photo" : `${earlier.length} earlier photos`}
          </Text>
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
      ) : null}

      <Text className="px-2 text-caption text-text-muted">
        Photos the print shop sent while making your job. Tap one to see it full size.
      </Text>
    </View>
  );
}

function photoAlt(link: ProgressPhotoLink): string {
  return link.at ? `Progress photo, ${formatTimelineStamp(link.at)}` : "Progress photo";
}

/** Rows of `size`, the last padded with nulls so every cell keeps its width. */
function chunk<T>(items: T[], size: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let index = 0; index < items.length; index += size) {
    const row: (T | null)[] = items.slice(index, index + size);
    while (row.length < size) row.push(null);
    rows.push(row);
  }
  return rows;
}
