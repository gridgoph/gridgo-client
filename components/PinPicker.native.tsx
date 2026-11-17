import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { PinPickerProps } from "@/components/PinPicker";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { PIN_MAP_HEIGHT } from "@/lib/dropoffPin";
import { buildMapHtml, externalPinScript, parseMapMessage, pickerMapModel } from "@/lib/mapHtml";
import type { GeoPoint } from "@/lib/tracking";

function samePoint(a: GeoPoint | null, b: GeoPoint | null): boolean {
  if (!a || !b) return false;
  return a.lat === b.lat && a.lng === b.lng;
}

/**
 * Where the job goes, put down by hand — or by search / Use my location.
 *
 * The same Leaflet-over-OSM document the delivery map uses, with tapping and
 * dragging turned on — one map stack in this app, not two, and no Google
 * Maps key or billing account for a client who only needs to point at their
 * own street.
 *
 * A pin is what delivery is actually priced from: GRIDGO charges by the
 * distance band between the shop and this point, so an address with no pin
 * has no delivery figure and the checkout sheet says so rather than guessing.
 *
 * A tap or a drag posts `{ type: "pin" }` back. An externally set point is
 * injected into the live document so the marker moves and the map pans
 * without reloading tiles. `children` are drawn over the map's top corner.
 */
export function PinPicker({ point, accuracyMeters, onPick, children }: PinPickerProps) {
  const theme = useThemeName() === "dark" ? "dark" : "light";
  const colors = useThemeColors();
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const lastTap = useRef<GeoPoint | null>(null);

  // Built once per theme, like the delivery map: the page owns the pin from
  // here, and rebuilding the document on every tap would reload the tiles.
  const html = useMemo(
    () => buildMapHtml(pickerMapModel({ theme, point, accuracyMeters, routeColor: colors.actionYellow })),
    [theme], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!point || !readyRef.current) return;
    // A tap or drag already placed the marker; injecting again would pan the
    // map out from under the finger.
    if (samePoint(lastTap.current, point)) return;
    webRef.current?.injectJavaScript(externalPinScript(point, accuracyMeters));
  }, [point, accuracyMeters]);

  const receive = (event: WebViewMessageEvent) => {
    const message = parseMapMessage(event.nativeEvent.data);
    // Anything else on the channel (a pan) is not a pin.
    if (message?.type !== "pin") return;
    const next = { lat: message.lat, lng: message.lng };
    lastTap.current = next;
    onPick(next);
  };

  return (
    <View style={{ height: PIN_MAP_HEIGHT }}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://localhost" }}
        onLoadEnd={() => {
          readyRef.current = true;
          if (point) webRef.current?.injectJavaScript(externalPinScript(point, accuracyMeters));
        }}
        onMessage={receive}
        javaScriptEnabled
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback={false}
        // Android: the form scrolls, and without this the scroll view takes
        // every vertical drag — the map would not pan and the pin would not move.
        nestedScrollEnabled
        style={{ flex: 1, backgroundColor: colors.surfaceVariant }}
        accessibilityLabel="Map of Davao. Tap or drag the pin to set your drop-off."
      />
      {children}
    </View>
  );
}
