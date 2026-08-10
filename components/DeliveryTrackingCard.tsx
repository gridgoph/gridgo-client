import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { DeliveryMap } from "@/components/DeliveryMap";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { useRoute } from "@/hooks/useRoute";
import type { Order } from "@/lib/api";
import * as api from "@/lib/api";
import { formatDeadline } from "@/lib/deadline";
import {
  isGeoPoint,
  summarizeTracking,
  type GeoPoint,
  type RiderPing,
} from "@/lib/tracking";

type Props = {
  order: Order;
};

/** How often the card asks the platform for a newer position. */
const POLL_MS = 30_000;

/**
 * Active delivery, watched not driven.
 *
 * Everything shown is something the platform actually returned. There is no
 * live ETA on GRIDGO, so none is invented: the card gives the distance left,
 * the real age of the position, and the date the supplier promised. An
 * out-of-date position is labelled as one, in words as well as colour.
 */
export function DeliveryTrackingCard({ order }: Props) {
  const [ping, setPing] = useState<RiderPing | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await api.getRiderLocation(order.id);
      setPing(result ? { lat: result.lat, lng: result.lng, at: result.at } : null);
      setUnavailable(false);
    } catch {
      // A failed poll must not silently look like "no rider yet".
      setUnavailable(true);
    }
  }, [order.id]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const pickup = isGeoPoint(order.pickup) ? (order.pickup as GeoPoint) : null;
  const dropoff = isGeoPoint(order.dropoff) ? (order.dropoff as GeoPoint) : null;
  const rider = useMemo(
    () => (ping ? { lat: ping.lat, lng: ping.lng } : null),
    [ping?.lat, ping?.lng], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Once the rider is sharing a position, the leg the client cares about is
  // the one still ahead of them. Before that, show the whole journey.
  const { route } = useRoute({ from: rider ?? pickup, to: dropoff });

  const summary = summarizeTracking({
    state: order.state,
    ping,
    dropoff,
    // Only claim a road distance for the leg actually being measured.
    roadDistanceMetres: rider && route?.routed ? route.distanceMetres : null,
  });

  const hasMappablePoints = Boolean(pickup || dropoff || rider);

  return (
    <View className="gg-card-flush">
      <View className="gap-2 border-b border-outline-subtle px-4 py-4">
        <Text className="text-h3 text-text-primary">Delivery</Text>
        <StatusChip tone={summary.chip.tone} label={summary.chip.label} icon={summary.chip.icon} />
      </View>

      {hasMappablePoints ? (
        <DeliveryMap
          pickup={pickup}
          dropoff={dropoff}
          rider={rider}
          stale={summary.stale}
          route={route?.coordinates ?? []}
          routed={Boolean(route?.routed)}
        />
      ) : (
        <View className="items-center bg-surface-variant px-4 py-8">
          <Text className="text-center text-body text-text-secondary">
            There is nothing to map yet — no pickup, drop-off or rider position has been set
            on this job.
          </Text>
        </View>
      )}

      <View className="gap-3 px-4 py-4">
        <Text className="text-body-lg text-text-primary">{summary.headline}</Text>
        <Text className="text-body text-text-secondary">{summary.detail}</Text>

        {unavailable ? (
          <View className="gap-2">
            <StatusChip tone="error" label="Could not check" icon="circle-x" />
            <Text className="text-body text-text-primary">
              GRIDGO could not reach the tracking service just now. What you see above is the
              last position it did get.
            </Text>
          </View>
        ) : null}

        <View className="gap-1 pt-1">
          {dropoff?.label ? (
            <Text className="text-caption text-text-muted">Delivering to {dropoff.label}</Text>
          ) : null}
          {order.promisedDate ? (
            <Text className="text-caption text-text-muted">
              Promised by {formatDeadline(order.promisedDate)}
            </Text>
          ) : null}
        </View>

        <SecondaryButton label="Check for an update" onPress={() => void refresh()} />
      </View>
    </View>
  );
}
