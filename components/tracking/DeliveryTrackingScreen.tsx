import {
  CircleAlert,
  CircleCheck,
  Clock,
  LocateFixed,
  MessageCircle,
  Radio,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { CallRiderButton } from "@/components/call/CallRiderButton";
import { DeliveryMap } from "@/components/DeliveryMap";
import { Screen } from "@/components/Screen";
import { MilestoneList, MilestoneRail } from "@/components/tracking/DeliveryMilestones";
import { TrackingPanel } from "@/components/tracking/TrackingPanel";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useRiderTracking } from "@/hooks/useRiderTracking";
import { useRoute } from "@/hooks/useRoute";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { deliveryChatOf } from "@/lib/deliveryChat";
import {
  currentMilestoneIndex,
  deliveryMilestonesOf,
  isGeoPoint,
  milestoneLine,
  trackingView,
  type GeoPoint,
  type TrackingIcon,
  type TrackingTone,
} from "@/lib/tracking";
import { panelGeometry } from "@/lib/trackingPanel";
import { usePlatformSettings } from "@/store/platformSettings";

type Props = {
  order: Order;
  /** The order's own record — handover code, progress, folds, help — under the panel. */
  children: ReactNode;
  /** Drawn beside the screen: a deep-linked route's way back. */
  overlay?: ReactNode;
  /** The one thing the client has to do, said in the peek so it is not buried under the map. */
  nextAction?: string | null;
  onOpenChat?: () => void;
  showCall?: boolean;
  /** The sharing window opened or closed: the order has moved and is worth reading again. */
  onOrderChanged?: () => void;
};

const STATUS_ICONS: Record<TrackingIcon, LucideIcon> = {
  "circle-check": CircleCheck,
  "triangle-alert": TriangleAlert,
  "circle-x": CircleAlert,
  clock: Clock,
  radio: Radio,
};

/**
 * A delivery, map first (gridgo-client#232, gridgo-api#217).
 *
 * While a rider has the job the map is the screen, the way a transport app
 * shows a ride: the rider's live position from pick-up until the delivery is
 * recorded, never before. A card on the map says in words what the map knows
 * — live, waiting for a first position, out of date with the last known
 * position kept, or not started yet and why. The panel below always shows the
 * rider's six steps; pulled up, it carries the rest of the order.
 *
 * Everything shown is something GRIDGO returned. There is no ETA: OSRM's
 * travel time is a routing engine's guess, so only the distance is said.
 */
export function DeliveryTrackingScreen({
  order,
  children,
  overlay,
  nextAction,
  onOpenChat,
  showCall = false,
  onOrderChanged,
}: Props) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const staleAfter = usePlatformSettings(
    (state) => state.settings?.riderLocationStaleAfterSeconds ?? null,
  );
  const { snapshot, failed, checking, refresh, now } = useRiderTracking(order.id, onOrderChanged);

  // Until the screen measures itself, the window is a close first guess, so
  // the panel lands in place on the first frame instead of popping in.
  const windowSize = useWindowDimensions();
  const [measuredHeight, setScreenHeight] = useState(0);
  const screenHeight = measuredHeight || Math.max(0, windowSize.height - 100);
  const [peekHeight, setPeekHeight] = useState(0);
  const [statusHeight, setStatusHeight] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [moved, setMoved] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);

  /*
    GRIDGO withholds the press's own pin from this app's projection, so on a
    delivery the origin is simply absent and the map draws the drop-off and
    the rider alone. It is never a shop's address.
  */
  const pickup = isGeoPoint(order.pickup) ? (order.pickup as GeoPoint) : null;
  const dropoff = isGeoPoint(order.dropoff) ? (order.dropoff as GeoPoint) : null;

  const firstView = trackingView({
    state: order.state,
    snapshot,
    dropoff,
    staleAfterSeconds: staleAfter,
    now,
  });
  const riderLat = firstView.rider?.lat ?? null;
  const riderLng = firstView.rider?.lng ?? null;
  const rider = useMemo(
    () => (riderLat != null && riderLng != null ? { lat: riderLat, lng: riderLng } : null),
    [riderLat, riderLng],
  );
  // Only the leg still ahead, and only while there is a rider to draw it from.
  const { route } = useRoute({ from: rider, to: dropoff });
  const view = trackingView({
    state: order.state,
    snapshot,
    dropoff,
    staleAfterSeconds: staleAfter,
    roadDistanceMetres: rider && route?.routed ? route.distanceMetres : null,
    now,
  });

  const milestones = deliveryMilestonesOf(order);
  const current = milestones[currentMilestoneIndex(milestones)];
  const next = milestones.find((milestone) => milestone.status === "pending");
  const chat = deliveryChatOf(order);
  const chatOpen = chat?.status === "open" && onOpenChat ? chat : null;

  const geometry = panelGeometry(screenHeight, peekHeight);
  const recenter = useCallback(() => {
    setMoved(false);
    setRecenterKey((key) => key + 1);
  }, []);
  const onMoved = useCallback(() => setMoved(true), []);

  const StatusIcon = STATUS_ICONS[view.status.icon];
  const statusColor = toneColor(view.status.tone, colors);

  return (
    <Screen edges={[]}>
      {overlay}
      <View
        style={{ flex: 1, backgroundColor: colors.surfaceVariant }}
        onLayout={(event) => setScreenHeight(event.nativeEvent.layout.height)}
      >
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          <DeliveryMap
            fill
            pickup={pickup}
            dropoff={dropoff}
            rider={view.rider}
            stale={view.stale}
            route={rider ? (route?.coordinates ?? []) : []}
            routed={Boolean(rider && route?.routed)}
            padTop={statusHeight + 12}
            padBottom={geometry.peek}
            controlsBottom={expanded ? geometry.height : geometry.peek}
            hideZoom={expanded}
            recenterKey={recenterKey}
            onMoved={onMoved}
          />
        </View>

        {/* What the map knows, in words. Pulled up, the panel says it instead. */}
        {expanded ? null : (
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(200)}
            exiting={reducedMotion ? undefined : FadeOut.duration(160)}
            pointerEvents="box-none"
            onLayout={(event) => setStatusHeight(event.nativeEvent.layout.height)}
            style={{ position: "absolute", top: 12, left: 16, right: 16 }}
          >
            <View
              accessible
              accessibilityRole="summary"
              accessibilityLiveRegion="polite"
              accessibilityLabel={`${view.status.label}. ${view.status.detail}${view.distance ? `. ${view.distance}` : ""}`}
              className="flex-row items-start gap-3 rounded-card border bg-surface px-4 py-3"
              style={{
                borderColor: view.status.tone === "warning" ? colors.warning : colors.outline,
                shadowColor: "#000",
                shadowOpacity: 0.12,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
              }}
            >
              <View className="pt-0.5">
                <StatusIcon size={20} color={statusColor} strokeWidth={2} aria-hidden />
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-body font-bold text-text-primary">{view.status.label}</Text>
                <Text className="text-caption text-text-secondary">{view.status.detail}</Text>
                {view.distance ? (
                  <Text className="text-caption text-text-secondary">{view.distance}</Text>
                ) : null}
              </View>
            </View>
            {moved && (rider || dropoff) ? (
              <Pressable
                onPress={recenter}
                accessibilityRole="button"
                accessibilityLabel="Recentre the map on your delivery"
                className="mt-2 h-11 flex-row items-center gap-2 self-end rounded-pill border bg-surface px-4"
                style={({ pressed }) => ({
                  borderColor: colors.outline,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <LocateFixed size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
                <Text className="text-button text-text-primary">Recentre</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        )}

        <TrackingPanel
          geometry={geometry}
          expanded={expanded}
          onExpandedChange={setExpanded}
          onPeekLayout={setPeekHeight}
          peek={
            <View className="gap-3 px-4 pb-4">
              <View className="flex-row items-start gap-3">
                <View className="flex-1 gap-1">
                  <Text className="text-h2 text-text-primary" accessibilityRole="header">
                    {current?.label ?? "Rider assigned"}
                  </Text>
                  <Text className="text-body text-text-secondary">
                    {milestoneLine(current?.code ?? "rider_assigned")}
                  </Text>
                </View>
                {chatOpen ? (
                  <Pressable
                    onPress={onOpenChat}
                    accessibilityRole="button"
                    accessibilityLabel="Message your rider about this delivery"
                    accessibilityHint="Share a gate code or landmark. Your phone number stays private."
                    className="gg-touch items-center gap-1 py-1"
                    style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                  >
                    <View
                      className="h-11 w-11 items-center justify-center rounded-pill"
                      style={{ backgroundColor: colors.accent }}
                    >
                      <MessageCircle
                        size={18}
                        color={colors.accentOn}
                        strokeWidth={2}
                        aria-hidden
                      />
                    </View>
                    <Text className="text-caption font-medium text-text-primary">Message</Text>
                  </Pressable>
                ) : null}
                {chatOpen && showCall ? <CallRiderButton orderId={order.id} /> : null}
              </View>

              <View className="gap-2">
                <MilestoneRail milestones={milestones} />
                {next ? (
                  <Text className="text-caption text-text-muted">Next: {next.label}</Text>
                ) : null}
              </View>

              <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <View className="flex-shrink flex-row items-center gap-2">
                  {failed ? (
                    <CircleAlert size={16} color={colors.error} strokeWidth={2} aria-hidden />
                  ) : (
                    <StatusIcon size={16} color={statusColor} strokeWidth={2} aria-hidden />
                  )}
                  <Text
                    className={
                      failed
                        ? "flex-shrink text-caption text-error"
                        : "flex-shrink text-caption text-text-secondary"
                    }
                  >
                    {failed
                      ? "Could not check just now. Showing the last update."
                      : (view.freshness ?? freshnessFallback(view.phase))}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    void refresh();
                    onOrderChanged?.();
                  }}
                  disabled={checking}
                  accessibilityRole="button"
                  accessibilityLabel="Check for an update"
                  accessibilityState={{ busy: checking }}
                  className="h-11 flex-row items-center gap-2 rounded-pill border px-4"
                  style={({ pressed }) => ({
                    borderColor: colors.outline,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <RefreshCw size={16} color={colors.textPrimary} strokeWidth={2} aria-hidden />
                  <Text className="text-button text-text-primary">
                    {checking ? "Checking…" : "Check for an update"}
                  </Text>
                </Pressable>
              </View>

              {nextAction && !expanded ? (
                <Pressable
                  onPress={() => setExpanded(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`${nextAction}. Show order details`}
                  className="flex-row items-center gap-3 rounded-field border px-4 py-3"
                  style={({ pressed }) => ({
                    borderColor: colors.warning,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <CircleAlert size={18} color={colors.warning} strokeWidth={2} aria-hidden />
                  <Text className="flex-1 text-body font-medium text-text-primary">
                    {nextAction}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          }
        >
          <View className="gap-6 px-4 pt-2">
            <View className="gap-3">
              <Text className="text-h3 text-text-primary">Delivery steps</Text>
              <MilestoneList milestones={milestones} />
              {dropoff?.label ? (
                <Text className="text-caption text-text-muted">Delivering to {dropoff.label}</Text>
              ) : null}
            </View>
            {children}
          </View>
        </TrackingPanel>
      </View>
    </Screen>
  );
}

function freshnessFallback(phase: string): string {
  switch (phase) {
    case "before_pickup":
      return "Shared from pick-up until delivery";
    case "waiting":
      return "No position yet";
    case "stale":
      return "No position yet";
    default:
      return "Not sharing a position";
  }
}

function toneColor(tone: TrackingTone, colors: ReturnType<typeof useThemeColors>): string {
  switch (tone) {
    case "success":
      return colors.success;
    case "warning":
      return colors.warning;
    case "error":
      return colors.error;
    case "info":
      return colors.info;
    default:
      return colors.textSecondary;
  }
}
