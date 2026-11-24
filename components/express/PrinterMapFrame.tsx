import { createElement, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { buildMapHtml, parseMapMessage, type MapModel } from "@/lib/mapHtml";

export type PrinterMapFrameProps = {
  model: MapModel;
  height: number;
  /** A tap on a printer's pin. */
  onPrinter: (id: string) => void;
};

const TITLE = "Map of the printers near you. The list below has the same printers.";

/**
 * The printer map on the web build: the same Leaflet document as the phone,
 * in a sandboxed iframe, the way `components/DeliveryMap.tsx` draws its map.
 */
export function PrinterMapFrame({ model, height, onPrinter }: PrinterMapFrameProps) {
  const colors = useThemeColors();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const ready = useRef(false);

  // A new document only when the theme flips; everything else is posted in.
  const html = useMemo(() => buildMapHtml(model), [model.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Posted by content, not identity: the host rebuilds its model every render.
  const message = JSON.stringify(model);
  useEffect(() => {
    if (ready.current) frame.current?.contentWindow?.postMessage(message, "*");
  }, [message]);

  const picked = useRef(onPrinter);
  useEffect(() => {
    picked.current = onPrinter;
  }, [onPrinter]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const listen = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const message = parseMapMessage(event.data);
      if (message?.type === "printer") picked.current(message.id);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, []);

  return (
    <View style={{ height }}>
      {createElement("iframe", {
        ref: frame,
        srcDoc: html,
        sandbox: "allow-scripts allow-popups",
        title: TITLE,
        onLoad: () => {
          ready.current = true;
          frame.current?.contentWindow?.postMessage(message, "*");
        },
        style: { border: 0, width: "100%", height: "100%", display: "block", backgroundColor: colors.surfaceVariant },
      })}
    </View>
  );
}
