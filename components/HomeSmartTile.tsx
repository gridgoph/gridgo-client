import { Award, Clock, Plus, Ticket } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { HOME_TILE_MIN_HEIGHT, HomeTileSlots } from "@/components/HomeTileSlots";
import { SkeletonBlock } from "@/components/Skeleton";
import { fontFamily } from "@/constants/fonts";
import { useThemeColors } from "@/hooks/useTheme";
import { daysLeftLine, type SmartTileView } from "@/lib/homeSummary";

/** Shared 1.0x floor for every state, so Home never resettles when the state changes. */
export const HOME_TILE_HEIGHT = HOME_TILE_MIN_HEIGHT;

type Props = {
  view: SmartTileView | null;
  onPress: (href: string) => void;
  onIntrinsicHeight?: (height: number) => void;
  minHeight?: number;
};

/**
 * Home's bottom-left tile: the first thing that applies to this client, in
 * GRIDGO's order — missions not finished, an order in progress, an unused
 * tester voucher, otherwise an invite (`lib/homeSummary.ts`).
 *
 * Every state shares the same minimum height and four slots (`HomeTileSlots`),
 * growing with larger system type and stretching to match its right-hand twin
 * so neither card clips or moves independently.
 */
export function HomeSmartTile({ view, onPress, onIntrinsicHeight, minHeight }: Props) {
  const floor = Math.max(HOME_TILE_HEIGHT, minHeight ?? 0);
  if (!view) {
    return (
      <View testID="smart-tile-loading" className="w-full grow" style={{ minHeight: floor, minWidth: 0 }}>
        <SkeletonBlock className="h-full w-full rounded-card" />
      </View>
    );
  }
  const voucher = view.kind === "tester_voucher";
  return (
    <Pressable
      testID={`smart-tile-${view.kind}`}
      onPress={() => onPress(view.href)}
      accessibilityRole="button"
      accessibilityLabel={view.label}
      className={
        voucher
          ? "w-full grow overflow-hidden rounded-card border-2 border-dashed border-brand bg-surface p-[11px]"
          : "w-full grow overflow-hidden rounded-card border border-outline bg-surface p-3"
      }
      style={{ minHeight: floor, minWidth: 0 }}
    >
      {({ pressed }) => (
        <>
          <TileBody view={view} onIntrinsicHeight={onIntrinsicHeight} />
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
        </>
      )}
    </Pressable>
  );
}

function Overline({ text, icon }: { text: string; icon?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-1" style={{ minWidth: 0 }}>
      {/* Tighter tracking than the page overline: the tile is half a phone wide. */}
      <Text className="flex-1 text-caption font-bold text-text-secondary" style={{ minWidth: 0 }}>
        {text}
      </Text>
      {icon ? <View className="shrink-0">{icon}</View> : null}
    </View>
  );
}

function TileBody({
  view,
  onIntrinsicHeight,
}: {
  view: SmartTileView;
  onIntrinsicHeight?: (height: number) => void;
}) {
  const colors = useThemeColors();
  switch (view.kind) {
    case "missions":
      return (
        <HomeTileSlots
          onIntrinsicHeight={onIntrinsicHeight}
          top={<Overline text="FOUNDING TESTER" icon={<Award size={18} color={colors.textPrimary} strokeWidth={2} />} />}
          title={
            <Text className="text-text-primary" style={{ fontFamily: fontFamily.black, fontSize: 24, lineHeight: 26 }}>
              {view.done}
              <Text className="text-h3 text-text-muted">/{view.total}</Text>
            </Text>
          }
          footer={<SegmentBar done={view.done} total={view.total} />}
        />
      );
    case "active_order":
      return (
        <HomeTileSlots
          onIntrinsicHeight={onIntrinsicHeight}
          top={
            <Overline
              text={view.more ? `YOUR ORDER · +${view.more}` : "YOUR ORDER"}
              icon={view.needsPayment ? <Clock size={16} color={colors.warning} strokeWidth={2} /> : undefined}
            />
          }
          title={<Text className="text-h3 text-text-primary">{view.headline}</Text>}
          subtitle={
            view.detail ? (
              <Text className="text-caption text-text-secondary" style={{ lineHeight: 18 }}>
                {view.detail}
              </Text>
            ) : null
          }
          footer={<SegmentBar done={view.step} total={view.stepCount} tone="ink" />}
        />
      );
    case "tester_voucher":
      return (
        <HomeTileSlots
          onIntrinsicHeight={onIntrinsicHeight}
          top={<Overline text="TESTER VOUCHER" icon={<Ticket size={18} color={colors.textPrimary} strokeWidth={2} />} />}
          title={<Text className="text-h3 text-text-primary">{view.amount} off</Text>}
          subtitle={
            <View className="flex-row items-center gap-1" style={{ minWidth: 0 }}>
              <Clock size={14} color={colors.textSecondary} strokeWidth={2} />
              <Text className="shrink text-caption text-text-secondary" style={{ lineHeight: 18 }}>
                {daysLeftLine(view.daysLeft)}
              </Text>
            </View>
          }
        />
      );
    case "invite":
      return (
        <HomeTileSlots
          onIntrinsicHeight={onIntrinsicHeight}
          top={<Overline text="INVITE A FRIEND" />}
          title={
            <View className="flex-row items-center gap-2" style={{ minWidth: 0 }}>
              <View className="h-6 w-6 items-center justify-center rounded-pill bg-accent">
                <Plus size={14} color={colors.accentOn} strokeWidth={2.5} />
              </View>
              <Text className="flex-1 text-h3 text-text-primary" style={{ minWidth: 0 }}>
                Share
              </Text>
            </View>
          }
          subtitle={
            <Text className="text-caption text-text-secondary" style={{ lineHeight: 18 }}>
              You each get a voucher
            </Text>
          }
        />
      );
    case "orders":
      return (
        <HomeTileSlots
          onIntrinsicHeight={onIntrinsicHeight}
          top={<Overline text="YOUR ORDERS" />}
          title={<Text className="text-h3 text-text-primary">See every job</Text>}
          subtitle={
            <Text className="text-caption text-text-secondary" style={{ lineHeight: 18 }}>
              Status, receipts, reorder
            </Text>
          }
        />
      );
  }
}

/**
 * A row of segments: done ones filled, the rest quiet. Shared by the missions
 * count and the four order steps. Ink, not yellow, for the order steps;
 * the missions bar spends the brand colour the way the Founding Tester
 * screen does.
 */
export function SegmentBar({ done, total, tone = "brand" }: { done: number; total: number; tone?: "brand" | "ink" }) {
  const segments = Array.from({ length: Math.max(1, total) }, (_, index) => index < done);
  return (
    <View className="flex-row gap-1" aria-hidden>
      {segments.map((filled, index) => (
        <View
          key={index}
          className={
            filled ? (tone === "brand" ? "h-1.5 flex-1 rounded-pill bg-brand" : "h-1.5 flex-1 rounded-pill bg-accent") : "h-1.5 flex-1 rounded-pill bg-outline"
          }
        />
      ))}
    </View>
  );
}
