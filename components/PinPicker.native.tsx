import { useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { PinPickerProps } from "@/components/PinPicker";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { buildMapHtml, type MapModel } from "@/lib/mapHtml";

const MAP_HEIGHT = 260;

/**
 * Where the job goes, put down by hand.
 *
 * The same Leaflet-over-OSM document the delivery map uses, with tapping turned
 * on — one map stack in this app, not two, and no Google Maps key or billing
 * account for a client who only needs to point at their own street.
 *
 * A pin is what delivery is actually priced from: GRIDGO charges by the
 * distance band between the shop and this point, so an address with no pin has
 * no delivery figure and the checkout sheet says so rather than guessing one.
 */
export function PinPicker({ point, onPick }: PinPickerProps) {
  const theme = useThemeName();
  const colors = useThemeColors();
  const webRef = useRef<WebView>(null);
  const [dropped, setDropped] = useState(Boolean(point));

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

  const receive = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        lat?: number;
        lng?: number;
      };
      if (message.type !== "pin") return;
      if (typeof message.lat !== "number" || typeof message.lng !== "number") return;
      setDropped(true);
      onPick({ lat: message.lat, lng: message.lng });
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
          onMessage={receive}
          javaScriptEnabled
          domStorageEnabled={false}
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback={false}
          style={{ flex: 1, backgroundColor: colors.surfaceVariant }}
          accessibilityLabel="Map of Davao. Tap to set your drop-off."
        />
      </View>
      <Text className="text-caption text-text-muted">
        {dropped
          ? "Tap again anywhere to move the pin."
          : "Tap the map where the job should go. GRIDGO prices delivery from this point."}
      </Text>
    </View>
  );
}
