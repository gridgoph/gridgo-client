import { createElement, useEffect, useRef } from "react";
import { View } from "react-native";

import { parseQrPictureMessage, QR_PICTURE_HTML, QR_PICTURE_TIMEOUT_MS, type QrPictureMessage } from "@/lib/qrPicture";

export type QrPictureReaderProps = {
  dataUrl: string;
  onResult: (result: Exclude<QrPictureMessage, { type: "ready" }>) => void;
};

/** The web build: the same page in a sandboxed frame, because `react-native-webview` has no web build. */
export function QrPictureReader({ dataUrl, onResult }: QrPictureReaderProps) {
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = parseQrPictureMessage(event.data);
      if (message?.type === "ready") frame.current?.contentWindow?.postMessage(dataUrl, "*");
      else if (message) onResult(message);
    };
    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => onResult({ type: "error" }), QR_PICTURE_TIMEOUT_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
    };
  }, [dataUrl, onResult]);

  return (
    <View aria-hidden pointerEvents="none" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      {createElement("iframe", {
        ref: frame,
        srcDoc: QR_PICTURE_HTML,
        sandbox: "allow-scripts",
        title: "",
        tabIndex: -1,
        style: { width: 1, height: 1, border: 0 },
      })}
    </View>
  );
}
