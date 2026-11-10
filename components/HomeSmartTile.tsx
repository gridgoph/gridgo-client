import { Award, Clock, Plus, Ticket } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { HomeTileSlots } from "@/components/HomeTileSlots";
import { SkeletonBlock } from "@/components/Skeleton";
import { fontFamily } from "@/constants/fonts";
import { useThemeColors } from "@/hooks/useTheme";
import { daysLeftLine, type SmartTileView } from "@/lib/homeSummary";

/** One height for every state, so Home never resettles when the state changes. */
export const HOME_TILE_HEIGHT = 112;

type Props = {
  view: SmartTileView | null;
  onPress: (href: string) => void;
};

/**
 * Home's bottom-left tile: the first thing that applies to this client, in
 * GRIDGO's order — missions not finished, an order in progress, an unused
 * tester voucher, otherwise an invite (`lib/homeSummary.ts`).
 *
 * Every state is the same box with the same three slots — an overline, one
 * big line, and a footer — so swapping states never changes the layout.
 */
export function HomeSmartTile({ view, onPress }: Props) {
  if (!view) {
    return (
      <View testID="smart-tile-loading" className="flex-1" style={{ height: HOME_TILE_HEIGHT, minWidth: 0, flexBasis: 0 }}>
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
          ? "flex-1 rounded-card border-2 border-dashed border-brand bg-surface p-[11px]"
          : "flex-1 rounded-card border border-outline bg-surface p-3"
      }
      style={({ pressed }) => [{ height: HOME_TILE_HEIGHT, minWidth: 0, flexBasis: 0 }, pressed ? { opacity: 0.75 } : null]}
    >
      <TileBody view={view} />
    </Pressable>
  );
}

function Overline({ text, icon }: { text: string; icon?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-2">
      {/* Tighter tracking than the page overline: the tile is half a phone wide. */}
      <Text className="flex-1 text-caption font-bold text-text-secondary" style={{ letterSpacing: 0.6 }} numberOfLines={1}>
        {text}
      </Text>
      {icon}
    </View>
  );
}

function TileBody({ view }: { view: SmartTileView }) {
  const colors = useThemeColors();
  switch (view.kind) {
    case "missions":
      return (
        <HomeTileSlots
          top={<Overline text="FOUNDING TESTER" icon={<Award size={18} color={colors.textPrimary} strokeWidth={2} />} />}
          title={
            // A 34pt line in the 26pt title slot, bottom-aligned: its baseline lands on the h3 baseline beside it.
            <Text className="text-text-primary" style={{ fontFamily: fontFamily.black, fontSize: 30, lineHeight: 34, marginTop: -8 }}>
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
          top={
            <Overline
              text={view.more ? `YOUR ORDER · +${view.more}` : "YOUR ORDER"}
              icon={view.needsPayment ? <Clock size={16} color={colors.warning} strokeWidth={2} /> : undefined}
            />
          }
          title={
            <Text className="text-h3 text-text-primary" numberOfLines={1}>
              {view.headline}
            </Text>
          }
          subtitle={
            view.detail ? (
              <Text className="text-caption text-text-secondary" numberOfLines={1}>
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
          top={<Overline text="TESTER VOUCHER" icon={<Ticket size={18} color={colors.textPrimary} strokeWidth={2} />} />}
          title={
            <Text className="text-h3 text-text-primary" numberOfLines={1}>
              {view.amount} off
            </Text>
          }
          subtitle={
            <View className="flex-row items-center gap-1">
              <Clock size={14} color={colors.textSecondary} strokeWidth={2} />
              <Text className="text-caption text-text-secondary">{daysLeftLine(view.daysLeft)}</Text>
            </View>
          }
        />
      );
    case "invite":
      return (
        <HomeTileSlots
          top={<Overline text="INVITE A FRIEND" />}
          title={
            <View className="flex-row items-center gap-2">
              <View className="h-6 w-6 items-center justify-center rounded-pill bg-accent">
                <Plus size={14} color={colors.accentOn} strokeWidth={2.5} />
              </View>
              <Text className="flex-1 text-h3 text-text-primary" numberOfLines={1}>
                Share
              </Text>
            </View>
          }
          subtitle={
            <Text className="text-caption text-text-secondary" numberOfLines={1}>
              You each get a voucher
            </Text>
          }
        />
      );
    case "orders":
      return (
        <HomeTileSlots
          top={<Overline text="YOUR ORDERS" />}
          title={
            <Text className="text-h3 text-text-primary" numberOfLines={1}>
              See every job
            </Text>
          }
          subtitle={
            <Text className="text-caption text-text-secondary" numberOfLines={1}>
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
