import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { QrPictureReaderProps } from "@/components/QrPictureReader";
import { parseQrPictureMessage, QR_PICTURE_HTML, QR_PICTURE_TIMEOUT_MS } from "@/lib/qrPicture";

/** Reads the QR in one picture, in a hidden page. Mount it only while there is one to read. */
export function QrPictureReader({ dataUrl, onResult }: QrPictureReaderProps) {
  const view = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) view.current?.injectJavaScript(`window.readQr(${JSON.stringify(dataUrl)}); true;`);
  }, [ready, dataUrl]);

  useEffect(() => {
    const timer = setTimeout(() => onResult({ type: "error" }), QR_PICTURE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [dataUrl, onResult]);

  const onMessage = (event: WebViewMessageEvent) => {
    const message = parseQrPictureMessage(event.nativeEvent.data);
    if (message?.type === "ready") setReady(true);
    else if (message) onResult(message);
  };

  return (
    <View
      pointerEvents="none"
      collapsable={false}
      style={{ position: "absolute", width: 16, height: 16, opacity: 0.01 }}
      aria-hidden
    >
      <WebView
        ref={view}
        source={SOURCE}
        onMessage={onMessage}
        onError={() => onResult({ type: "offline" })}
        onRenderProcessGone={() => onResult({ type: "error" })}
        javaScriptEnabled
        originWhitelist={["*"]}
        androidLayerType="hardware"
      />
    </View>
  );
}

const SOURCE = { html: QR_PICTURE_HTML, baseUrl: "https://cdn.jsdelivr.net/" };
