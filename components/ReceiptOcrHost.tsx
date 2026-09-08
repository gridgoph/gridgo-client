import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { RECEIPT_OCR_HTML } from "@/lib/receiptOcrHtml";
import {
  completeReceiptOcr,
  failReceiptOcr,
  pendingReceiptOcrDataUrl,
  subscribeReceiptOcr,
} from "@/lib/receiptOcrRecognize";

/**
 * Hidden Tesseract.js host. Checkout mounts it so a receipt pick can OCR
 * without a native module Expo Go does not ship.
 */
export function ReceiptOcrHost() {
  const view = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [ticket, setTicket] = useState(0);

  useEffect(() => subscribeReceiptOcr(() => setTicket((n) => n + 1)), []);

  const dataUrl = pendingReceiptOcrDataUrl();

  useEffect(() => {
    if (!ready || !dataUrl) return;
    const js = `window.runOcr(${JSON.stringify(dataUrl)}); true;`;
    view.current?.injectJavaScript(js);
  }, [ready, dataUrl, ticket]);

  const onMessage = (event: WebViewMessageEvent) => {
    let payload: { type?: string; text?: string; confidence?: number; message?: string };
    try {
      payload = JSON.parse(event.nativeEvent.data) as typeof payload;
    } catch {
      failReceiptOcr("The screenshot could not be read.");
      return;
    }
    if (payload.type === "ready") {
      setReady(true);
      return;
    }
    if (payload.type === "result") {
      completeReceiptOcr({
        text: typeof payload.text === "string" ? payload.text : "",
        confidence: typeof payload.confidence === "number" ? payload.confidence : 0,
      });
      return;
    }
    if (payload.type === "error") {
      failReceiptOcr(payload.message || "The screenshot could not be read.");
    }
  };

  return (
    <View
      pointerEvents="none"
      collapsable={false}
      style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <WebView
        ref={view}
        source={{
          html: RECEIPT_OCR_HTML,
          baseUrl: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/",
        }}
        onMessage={onMessage}
        javaScriptEnabled
        originWhitelist={["*"]}
        androidLayerType="hardware"
      />
    </View>
  );
}
