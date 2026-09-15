import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { PinPickerProps } from "@/components/PinPicker";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { buildMapHtml, externalPinScript, type MapModel } from "@/lib/mapHtml";
import type { GeoPoint } from "@/lib/tracking";

const MAP_HEIGHT = 260;

function samePoint(a: GeoPoint | null, b: GeoPoint | null): boolean {
  if (!a || !b) return false;
  return a.lat === b.lat && a.lng === b.lng;
}

/**
 * Where the job goes, put down by hand — or by search / Use my location.
 *
 * The same Leaflet-over-OSM document the delivery map uses, with tapping turned
 * on — one map stack in this app, not two, and no Google Maps key or billing
 * account for a client who only needs to point at their own street.
 *
 * A pin is what delivery is actually priced from: GRIDGO charges by the
 * distance band between the shop and this point, so an address with no pin has
 * no delivery figure and the checkout sheet says so rather than guessing one.
 *
 * Taps post `{ type: "pin" }` back. An externally set point is injected into
 * the live document so the marker moves and the map pans without reloading
 * tiles.
 */
export function PinPicker({ point, onPick, caption }: PinPickerProps) {
  const theme = useThemeName();
  const colors = useThemeColors();
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const lastTap = useRef<GeoPoint | null>(null);
  // A marker exists once a point does, or once the client has tapped one in
  // and the parent has not yet echoed it back.
  const [tapped, setTapped] = useState(false);
  const dropped = tapped || Boolean(point);

  const model: MapModel = useMemo(
    () => ({
      theme: theme === "dark" ? "dark" : "light",
      pickup: null,
      dropoff: point,
      // No pickup point is drawn here at all; the label is inert.
      pickupLabel: "",
      dropoffLabel: "Drop-off",
      routeCoordinates: [],
      routeColor: colors.actionYellow,
      rider: null,
      riderStale: false,
      routeUnavailable: false,
      pickable: true,
    }),
    [theme, point, colors.actionYellow],
  );

  // Built once per theme, like the delivery map: the page owns the pin from
  // here, and rebuilding the document on every tap would reload the tiles.
  const html = useMemo(() => buildMapHtml(model), [model.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyExternal = (next: GeoPoint) => {
    webRef.current?.injectJavaScript(externalPinScript(next));
  };

  useEffect(() => {
    if (!point) return;
    if (!readyRef.current) return;
    // A tap already placed the marker; injecting again would pan the map
    // out from under the finger.
    if (samePoint(lastTap.current, point)) return;
    applyExternal(point);
  }, [point]);

  const receive = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        lat?: number;
        lng?: number;
      };
      if (message.type !== "pin") return;
      if (typeof message.lat !== "number" || typeof message.lng !== "number") return;
      const next = { lat: message.lat, lng: message.lng };
      lastTap.current = next;
      setTapped(true);
      onPick(next);
    } catch {
      // A message this component does not understand is not an error worth
      // showing anyone — the pin simply has not moved.
    }
  };

  return (
    <View className="gap-2">
      <View className="gg-card-flush" style={{ height: MAP_HEIGHT }}>
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html, baseUrl: "https://localhost" }}
          onLoadEnd={() => {
            readyRef.current = true;
            if (point) applyExternal(point);
          }}
          onMessage={receive}
          javaScriptEnabled
          domStorageEnabled={false}
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback={false}
          style={{ flex: 1, backgroundColor: colors.surfaceVariant }}
          accessibilityLabel="Map of Davao. Tap to set your drop-off."
        />
      </View>
      <Text className={caption ? "text-caption text-text-secondary" : "text-caption text-text-muted"}>
        {caption ||
          (dropped
            ? "Tap again anywhere to move the pin."
            : "Tap the map where the job should go. GRIDGO prices delivery from this point.")}
      </Text>
    </View>
  );
}
