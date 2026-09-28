import { ChevronDown } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { OrderStageRail } from "@/components/OrderStageRail";
import { OrderTimeline } from "@/components/OrderTimeline";
import { ProgressPhotoSheet, WaitingForPhoto, photoAlt } from "@/components/ProductionProgress";
import { SamplePhoto } from "@/components/SamplePhoto";
import { StatusChip } from "@/components/StatusChip";
import { useProductionPhotoLinks } from "@/hooks/useProductionPhotoLinks";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order, ProductionPhoto } from "@/lib/api";
import { historyRows } from "@/lib/orderHistory";
import { countLabel, photosByHistoryRow } from "@/lib/orderSections";
import { fulfilmentRailKind, orderStageIndex } from "@/lib/orderStages";
import { orderStateMeta } from "@/lib/orderState";
import { paysInFull } from "@/lib/payment";
import { hasPlainHistory, progressView, WAITING_FOR_PHOTO } from "@/lib/productionProgress";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useOrderSections } from "@/store/orderSections";

const NO_PHOTOS: ProductionPhoto[] = [];
const MAKING_STATES = ["production", "supplier_self_qc"];

type Props = {
  order: Order;
  /**
   * Who the job is waiting on, when nothing else on the screen already says
   * it. The screen decides: an action zone owns its own instruction.
   */
  note?: string | null;
};

/**
 * The top of an order: the latest thing that happened, and where the job
 * stands (gridgo-client#129).
 *
 * The whole docket is one button. Tapped, it opens the job's history from
 * the request to now, newest first, with each progress photo under the step it
 * was taken in. The history's fold is remembered like the sections below it.
 *
 * The exact state is the chip; the rail under it is coarse on purpose and never
 * replaces it. The newest photo rides along as a still thumbnail — its loupe
 * lives in the history, so the docket keeps one thing to do on tap.
 */
export function LatestProgressCard({ order, note }: Props) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const open = useOrderSections((state) => state.open.history);
  const toggle = useOrderSections((state) => state.toggle);

  const meta = orderStateMeta(order);
  const rows = historyRows(order.timeline, {
    plainNotes: hasPlainHistory(order),
    fulfillmentMode: order.fulfillmentMode,
    paidInFull: paysInFull(order),
  });
  const latest = rows.at(-1) ?? null;

  // Keyed on the fields it reads, so a live refresh that changes nothing does
  // not hand the photo links a new list to re-sign.
  const { state, productionProgress } = order;
  const progress = useMemo(
    () => progressView({ state, productionProgress }),
    [state, productionProgress],
  );
  const photos = progress?.kind === "photos" ? progress.photos : NO_PHOTOS;
  const { links, onStale } = useProductionPhotoLinks(photos);
  const newest = links[0] ?? null;
  const linkById = new Map(links.map((link) => [link.fileId, link]));

  const photoRows = photosByHistoryRow(rows, photos);
  const waitingRow =
    progress?.kind === "waiting"
      ? ([...rows].reverse().find((row) => MAKING_STATES.includes(row.state)) ?? latest)
      : null;

  const stage = orderStageIndex(order.state, order.fulfillmentMode);
  const when = latest ? formatRelativeTime(latest.at) : null;
  const counts = [
    rows.length ? countLabel(rows.length, "update", "updates") : null,
    photos.length ? countLabel(photos.length, "photo", "photos") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const label = [
    "Latest progress",
    meta.label,
    latest && latest.title !== meta.label ? latest.title : null,
    when,
    note,
    progress?.kind === "waiting" ? WAITING_FOR_PHOTO : null,
    counts || null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <View className="gg-card-flush">
      <Pressable
        onPress={() => toggle("history")}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? "Folds the full history away" : "Shows the full history with photos"}
        className="gap-4 p-4"
        style={({ pressed }) => (pressed ? { opacity: 0.8 } : undefined)}
      >
        <View className="flex-row gap-3">
          <View className="min-w-0 flex-1 gap-2">
            <View className="flex-row items-center justify-between gap-3">
              <StatusChip tone={meta.tone} label={meta.label} icon={meta.icon} />
              {when ? <Text className="shrink text-caption text-text-muted">{when}</Text> : null}
            </View>
            {latest ? (
              <Text className="text-h3 text-text-primary">{latest.title}</Text>
            ) : null}
            {note ? <Text className="text-body text-text-secondary">{note}</Text> : null}
          </View>
          {newest ? (
            <View className="w-20">
              <SamplePhoto
                url={newest.url}
                expiresAt={newest.expiresAt}
                onStale={onStale}
                altText={`Latest ${photoAlt(newest).toLowerCase()}`}
                gutter="tight"
                emptyLabel="Will not load"
                interactive={false}
              />
            </View>
          ) : null}
        </View>

        {progress?.kind === "waiting" ? <WaitingForPhoto /> : null}

        <OrderStageRail
          currentIndex={stage}
          kind={fulfilmentRailKind(order.fulfillmentMode)}
          variant="compact"
        />

        <View className="flex-row items-center gap-2 border-t border-outline-subtle pt-3">
          <Text className="flex-1 text-body font-medium text-text-primary">
            {open ? "Hide full history" : "Full history"}
          </Text>
          {counts ? <Text className="text-caption text-text-muted">{counts}</Text> : null}
          <View style={open ? { transform: [{ rotate: "180deg" }] } : undefined}>
            <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
          </View>
        </View>
      </Pressable>

      {open ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(180)}
          className="gap-4 border-t border-outline-subtle px-4 pb-4 pt-4"
        >
          <OrderTimeline
            rows={rows}
            currentState={order.state}
            renderBelow={(row) => {
              const rowPhotos = photoRows.get(row.key);
              const waiting = waitingRow?.key === row.key && progress?.kind === "waiting";
              if (!rowPhotos?.length && !waiting) return null;
              return (
                <View className="gap-2 pt-3">
                  {rowPhotos?.length ? (
                    <ProgressPhotoSheet
                      links={rowPhotos.flatMap((photo) => linkById.get(photo.fileId) ?? [])}
                      onStale={onStale}
                    />
                  ) : null}
                  {waiting ? <WaitingForPhoto body={progress.body} /> : null}
                </View>
              );
            }}
          />
          {progress?.kind === "waiting" && !waitingRow ? <WaitingForPhoto body={progress.body} /> : null}
          {photos.length ? (
            <Text className="text-caption text-text-muted">
              Photos the print shop sent while making your job. Tap one to see it full size.
            </Text>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}
