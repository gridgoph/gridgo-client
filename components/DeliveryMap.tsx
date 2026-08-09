import { Text, View } from "react-native";

import type { GeoPoint, LonLat } from "@/lib/tracking";

export type DeliveryMapProps = {
  /** Supplier's print shop, once one is assigned. */
  pickup: GeoPoint | null;
  dropoff: GeoPoint | null;
  rider: GeoPoint | null;
  /** Draws the rider faded; the card carries the reason in words. */
  stale: boolean;
  /** GeoJSON [lon, lat] route coordinates, road or straight-line. */
  route: LonLat[];
  /** True when the line is a real road route rather than the fallback. */
  routed: boolean;
};

/**
 * Map fallback for platforms without a WebView — the web build.
 *
 * `react-native-webview` has no web implementation and renders its own
 * "does not support this platform" notice in red, which is exactly the kind of
 * internal string that must never reach a client. This says something true
 * instead. The real map is `DeliveryMap.native.tsx`.
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
