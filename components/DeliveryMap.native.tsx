import { useEffect, useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";

import type { DeliveryMapProps } from "@/components/DeliveryMap";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { GRIDGO_OFFICE_LABEL } from "@/lib/gridgoOffice";
import { buildMapHtml, deliveryMapModel, parseMapMessage } from "@/lib/mapHtml";
import { isGeoPoint } from "@/lib/tracking";

/** On a card; the delivery screen passes `fill` and the map takes the screen. */
const MAP_HEIGHT = 220;

/**
 * The delivery on a real map: the drop-off, the rider's last shared position,
 * and the road route between them — or, on a collected order, GRIDGO's counter.
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
 * The client watches; nothing on the map drives the delivery. Panning and
 * zooming are theirs, and once they move the view a newer position no longer
 * refits it until they recentre. A position the app judges out of date is
 * drawn as a last known position, and the screen says why in words.
 */
export function DeliveryMap({
  pickup,
  dropoff,
  rider,
  stale,
  route,
  routed,
  fill,
  padTop,
  padBottom,
  controlsBottom,
  hideZoom,
  recenterKey,
  onMoved,
}: DeliveryMapProps) {
  const theme = useThemeName() === "dark" ? "dark" : "light";
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);

  const model = useMemo(
    () =>
      deliveryMapModel({
        theme,
        pickup: isGeoPoint(pickup) ? pickup : null,
        dropoff: isGeoPoint(dropoff) ? dropoff : null,
        rider: isGeoPoint(rider) ? rider : null,
        stale,
        route,
        routed,
        routeColor: colors.actionYellow,
        pickupLabel: GRIDGO_OFFICE_LABEL,
        padTop,
        padBottom,
        controlsBottom,
        hideZoom,
        recenterKey,
        reduceMotion,
      }),
    [
      theme,
      pickup,
      dropoff,
      rider,
      stale,
      route,
      routed,
      colors.actionYellow,
      padTop,
      padBottom,
      controlsBottom,
      hideZoom,
      recenterKey,
      reduceMotion,
    ],
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
    <View style={fill ? { flex: 1 } : { height: MAP_HEIGHT }}>
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
        onMessage={(event) => {
          if (parseMapMessage(event.nativeEvent.data)?.type === "moved") onMoved?.();
        }}
        style={{ flex: 1, backgroundColor: colors.surfaceVariant }}
        // A card-sized map must not fight the order screen's ScrollView on Android.
        nestedScrollEnabled
        scrollEnabled={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="compatibility"
        androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
        accessibilityLabel="Map showing your delivery address and the rider"
      />
    </View>
  );
}
