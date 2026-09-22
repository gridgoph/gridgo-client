import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Platform, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { RECEIPT_OCR_HTML } from "@/lib/receiptOcrHtml";
import {
  completeReceiptOcr,
  failReceiptOcr,
  pendingReceiptOcr,
  subscribeReceiptOcr,
  type ReceiptOcrRequest,
} from "@/lib/receiptOcrRecognize";

/** Expo Go supplies the browser/Worker/WASM runtime; no native OCR module. */
export function ReceiptOcrHost() {
  const request = useSyncExternalStore(subscribeReceiptOcr, pendingReceiptOcr);
  // Checkout on Expo web runs Tesseract in-page. A hidden WebView iframe
  // never posts ready/result, so do not mount one there.
  if (Platform.OS === "web") return null;
  // A timeout/replacement destroys the old worker with its WebView. Its late
  // messages cannot finish the next receipt, even when it is the same image.
  return request ? <ReceiptOcrJob key={request.id} request={request} /> : null;
}

function ReceiptOcrJob({ request }: { request: ReceiptOcrRequest }) {
  const view = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    view.current?.injectJavaScript(`window.runOcr(${JSON.stringify(request.dataUrl)}); true;`);
  }, [ready, request]);

  const fail = (message: string) => failReceiptOcr(request.id, message);
  const onMessage = (event: WebViewMessageEvent) => {
    let payload: { type?: string; text?: string; confidence?: number; message?: string };
    try {
      payload = JSON.parse(event.nativeEvent.data) as typeof payload;
    } catch {
      fail("The screenshot could not be read.");
      return;
    }
    if (payload.type === "ready") setReady(true);
    if (payload.type === "result") {
      completeReceiptOcr(request.id, {
        text: typeof payload.text === "string" ? payload.text : "",
        confidence: typeof payload.confidence === "number" ? payload.confidence : 0,
      });
    }
    if (payload.type === "error") fail(payload.message || "The screenshot could not be read.");
  };

  return (
    <View
      pointerEvents="none"
      collapsable={false}
      style={{ position: "absolute", width: 16, height: 16, opacity: 0.01 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <WebView
        ref={view}
        source={OCR_SOURCE}
        onMessage={onMessage}
        onError={() => fail("The receipt reader could not load.")}
        onRenderProcessGone={() => fail("The receipt reader stopped. Pick the screenshot again.")}
        javaScriptEnabled
        originWhitelist={["*"]}
        androidLayerType="hardware"
      />
    </View>
  );
}

const OCR_SOURCE = {
  html: RECEIPT_OCR_HTML,
  baseUrl: "https://cdn.jsdelivr.net/",
};
