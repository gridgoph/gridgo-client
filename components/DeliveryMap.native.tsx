import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { DeliveryMapProps } from "@/components/DeliveryMap";

/**
 * The delivery on a real map: the print shop, the drop-off, and the rider's
 * last shared position joined by the route line.
 *
 * The client watches; nothing here can steer the delivery. A stale position is
 * dimmed, and the card around this map says in words how old it is — the map
 * never implies the pin is current on its own.
 *
 * `react-native-maps` is loaded defensively: if the host runtime has no map
 * module, the screen degrades to the honest notice rather than crashing on a
 * screen whose job is to be trustworthy.
 */

type MapsModule = typeof import("react-native-maps");

let maps: MapsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  maps = require("react-native-maps") as MapsModule;
} catch {
  maps = null;
}

const MAP_HEIGHT = 220;

export function DeliveryMap({ region, pickup, dropoff, rider, stale }: DeliveryMapProps) {
  const colors = useThemeColors();

  if (!maps?.default) {
    return (
      <View className="items-center justify-center bg-surface-variant px-4 py-8">
        <Text className="text-center text-body text-text-secondary">
          The map could not be loaded on this device.
        </Text>
        <Text className="mt-1 text-center text-caption text-text-muted">
          The rider position and last-updated time below are unaffected.
        </Text>
      </View>
    );
  }

  const MapView = maps.default;
  const { Marker, Polyline } = maps;

  const route = [pickup, rider, dropoff].filter((point): point is NonNullable<typeof point> =>
    Boolean(point),
  );

  return (
    <View style={{ height: MAP_HEIGHT }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={region}
        region={region}
        // The client watches this delivery; they do not drive it.
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        accessibilityLabel="Map of this delivery"
      >
        {route.length > 1 ? (
          <Polyline
            coordinates={route.map((point) => ({
              latitude: point.lat,
              longitude: point.lng,
            }))}
            strokeColor={colors.actionYellow}
            strokeWidth={4}
          />
        ) : null}

        {pickup ? (
          <Marker
            coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
            title="Print shop"
            description={pickup.label ?? undefined}
            pinColor={colors.textMuted}
          />
        ) : null}

        {dropoff ? (
          <Marker
            coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }}
            title="Your delivery address"
            description={dropoff.label ?? undefined}
            pinColor={colors.info}
          />
        ) : null}

        {rider ? (
          <Marker
            coordinate={{ latitude: rider.lat, longitude: rider.lng }}
            title={stale ? "Rider — last known position" : "Rider"}
            description={stale ? "This position is out of date" : undefined}
            opacity={stale ? 0.45 : 1}
            pinColor={colors.textPrimary}
          />
        ) : null}
      </MapView>
    </View>
  );
}
