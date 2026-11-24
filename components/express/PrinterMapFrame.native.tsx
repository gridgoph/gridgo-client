import { useEffect, useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";

import type { PrinterMapFrameProps } from "@/components/express/PrinterMapFrame";
import { useThemeColors } from "@/hooks/useTheme";
import { buildMapHtml, parseMapMessage } from "@/lib/mapHtml";

/**
 * The printer map on a phone: Leaflet over OpenStreetMap in a WebView, the
 * same stack as `components/DeliveryMap.native.tsx`. No Google Maps.
 */
export function PrinterMapFrame({ model, height, onPrinter }: PrinterMapFrameProps) {
  const colors = useThemeColors();
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);

  // Rebuild only on a theme flip, so tiles swap cleanly; the rest is injected.
  const html = useMemo(() => buildMapHtml(model), [model.theme]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = `try { applyModel(${JSON.stringify(model)}); } catch (e) {} true;`;

  useEffect(() => {
    if (readyRef.current) webRef.current?.injectJavaScript(apply);
  }, [apply]);

  return (
    <View style={{ height }}>
      <WebView
        testID="printer-map"
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://localhost" }}
        onLoadEnd={() => {
          readyRef.current = true;
          webRef.current?.injectJavaScript(apply);
        }}
        onMessage={(event) => {
          const message = parseMapMessage(event.nativeEvent.data);
          if (message?.type === "printer") onPrinter(message.id);
        }}
        style={{ flex: 1, backgroundColor: colors.surfaceVariant }}
        // A card-sized map inside the step's scroll view.
        nestedScrollEnabled
        scrollEnabled={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="compatibility"
        androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
        accessibilityLabel="Map of the printers near you. The list below has the same printers."
      />
    </View>
  );
}
