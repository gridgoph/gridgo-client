import { useEffect, useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";

import type { DeliveryMapProps } from "@/components/DeliveryMap";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { GRIDGO_OFFICE_LABEL } from "@/lib/gridgoOffice";
import { buildMapHtml, type MapModel } from "@/lib/mapHtml";
import { isGeoPoint } from "@/lib/tracking";

const MAP_HEIGHT = 220;

/**
 * The delivery on a real map: GRIDGO's counter, the drop-off, and the rider's
 * last shared position joined by the road route.
 *
 * The origin pin is GRIDGO — never the press that ran the job. A client buys
 * from GRIDGO and collects from GRIDGO, and the shop behind the counter is not
 * theirs to be given an address for. The API withholds it from this app's
 * projection too; the label here is the belt to that pair of braces.
 *
 * Leaflet over OpenStreetMap tiles inside a WebView — the same stack
 * `components/TripMap.tsx` in **gridgo-rider** runs, so GRIDGO has one map
 * implementation rather than two. No Google Maps. Dark Carto tiles use the
 * same token as Rider. The map renders the same on every Android phone
 * whether or not Play Services are present.
 *
 * The client watches; every gesture that would let them drive the delivery is
 * off. A position the app judges out of date is drawn faded, and the card
 * around this map says why in words — the fade is never the only signal.
 */
export function DeliveryMap({ pickup, dropoff, rider, stale, route, routed }: DeliveryMapProps) {
  const theme = useThemeName();
  const colors = useThemeColors();
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);

  const model: MapModel = useMemo(
    () => ({
      theme: theme === "dark" ? "dark" : "light",
      pickup: isGeoPoint(pickup) ? pickup : null,
      dropoff: isGeoPoint(dropoff) ? dropoff : null,
      pickupLabel: pickup?.label || GRIDGO_OFFICE_LABEL,
      pickupMark: "GRIDGO",
      dropoffLabel: dropoff?.label || "Your delivery address",
      routeCoordinates: route,
      routeColor: colors.actionYellow,
      rider: isGeoPoint(rider) ? rider : null,
      riderStale: stale,
      // Only worth saying once the app actually tried to route.
      routeUnavailable: route.length >= 2 && !routed,
    }),
    [theme, pickup, dropoff, rider, stale, route, routed, colors.actionYellow],
  );

  // Rebuild the document only when the theme flips, so the tile set swaps
  // cleanly. Every other change is pushed into the live page instead.
  const html = useMemo(() => buildMapHtml(model), [model.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!readyRef.current || !webRef.current) return;
    webRef.current.injectJavaScript(
      `try { applyModel(${JSON.stringify(model)}); } catch (e) {} true;`,
    );
  }, [model]);

  return (
    <View style={{ height: MAP_HEIGHT }}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://localhost" }}
        onLoadEnd={() => {
          readyRef.current = true;
          webRef.current?.injectJavaScript(
            `try { applyModel(${JSON.stringify(model)}); } catch (e) {} true;`,
          );
        }}
        style={{ flex: 1, backgroundColor: colors.surfaceVariant }}
        // Map gestures must not fight the order screen's ScrollView on Android.
        nestedScrollEnabled
        scrollEnabled={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="compatibility"
        androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
        accessibilityLabel="Map showing GRIDGO, your delivery address, and the rider"
      />
    </View>
  );
}
