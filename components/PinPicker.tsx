import { createElement, useEffect, useMemo, useRef, type ReactNode } from "react";
import { View } from "react-native";

import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { PIN_MAP_HEIGHT } from "@/lib/dropoffPin";
import { buildMapHtml, parseMapMessage, pickerMapModel, setPinMessage } from "@/lib/mapHtml";
import type { GeoPoint } from "@/lib/tracking";

export type PinPickerProps = {
  /** Where the pin is now. Null until the client puts one down. */
  point: GeoPoint | null;
  /** The phone's error radius round a Use-my-location pin, in metres. */
  accuracyMeters?: number | null;
  /** A tap or a drag on the map. */
  onPick: (point: GeoPoint) => void;
  /** Controls drawn over the map (Use my location). */
  children?: ReactNode;
};

/**
 * The picker on the web build.
 *
 * `react-native-webview` has no web implementation and draws its own red
 * "does not support this platform" notice, which must never reach a client.
 * The page itself is plain HTML, so the browser draws the very same Leaflet
 * document in a sandboxed iframe, as `DeliveryMap.tsx` does — the web used to
 * get no map at all, only "The map needs the GRIDGO app on your phone".
 */
export function PinPicker({ point, accuracyMeters, onPick, children }: PinPickerProps) {
  const theme = useThemeName() === "dark" ? "dark" : "light";
  const colors = useThemeColors();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const ready = useRef(false);
  const lastTap = useRef<GeoPoint | null>(null);
  const latest = useRef({ point, accuracyMeters });
  useEffect(() => {
    latest.current = { point, accuracyMeters };
  });

  // A new document only when the theme flips; pins are posted in.
  const html = useMemo(
    () => buildMapHtml(pickerMapModel({ theme, point: null, routeColor: colors.actionYellow })),
    [theme], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const post = (next: GeoPoint, accuracy?: number | null) => {
    frame.current?.contentWindow?.postMessage(setPinMessage(next, accuracy), "*");
  };

  useEffect(() => {
    if (!point || !ready.current) return;
    if (lastTap.current && lastTap.current.lat === point.lat && lastTap.current.lng === point.lng) return;
    post(point, accuracyMeters);
  }, [point, accuracyMeters]);

  const picked = useRef(onPick);
  useEffect(() => {
    picked.current = onPick;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const listen = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const message = parseMapMessage(event.data);
      if (message?.type !== "pin") return;
      const next = { lat: message.lat, lng: message.lng };
      lastTap.current = next;
      picked.current(next);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, []);

  return (
    <View style={{ height: PIN_MAP_HEIGHT }}>
      {createElement("iframe", {
        ref: frame,
        srcDoc: html,
        // Its own opaque origin: the map can run its script and open the
        // attribution links, and can reach nothing of the app around it.
        sandbox: "allow-scripts allow-popups",
        title: "Map of Davao. Tap or drag the pin to set your drop-off.",
        onLoad: () => {
          ready.current = true;
          const now = latest.current;
          if (now.point) post(now.point, now.accuracyMeters);
        },
        style: {
          border: 0,
          width: "100%",
          height: "100%",
          display: "block",
          backgroundColor: colors.surfaceVariant,
        },
      })}
      {children}
    </View>
  );
}
