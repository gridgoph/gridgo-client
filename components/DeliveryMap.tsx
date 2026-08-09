import { Text, View } from "react-native";

import type { GeoPoint, MapRegion } from "@/lib/tracking";

export type DeliveryMapProps = {
  region: MapRegion;
  pickup: GeoPoint | null;
  dropoff: GeoPoint | null;
  rider: GeoPoint | null;
  /** Dims the rider pin; the words beside the map carry the meaning. */
  stale: boolean;
};

/**
 * Map fallback for platforms without one — the web build, and any runtime
 * where the native map module is unavailable.
 *
 * It states that plainly instead of drawing an empty frame. The native map
 * lives in `DeliveryMap.native.tsx`.
 */
export function DeliveryMap(_props: DeliveryMapProps) {
  return (
    <View className="items-center justify-center bg-surface-variant px-4 py-8">
      <Text className="text-center text-body text-text-secondary">
        The delivery map is available in the GRIDGO app on your phone.
      </Text>
      <Text className="mt-1 text-center text-caption text-text-muted">
        The rider position and last-updated time below are the same either way.
      </Text>
    </View>
  );
}
