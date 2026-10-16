import { createElement, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { GRIDGO_OFFICE_LABEL } from "@/lib/gridgoOffice";
import { buildMapHtml, deliveryMapModel, parseMapMessage } from "@/lib/mapHtml";
import { isGeoPoint, type GeoPoint, type LonLat } from "@/lib/tracking";

export type DeliveryMapProps = {
  /** GRIDGO's counter on a collected order; withheld on a delivery. */
  pickup: GeoPoint | null;
  dropoff: GeoPoint | null;
  rider: GeoPoint | null;
  /** Draws the rider as a last known position; the screen says why in words. */
  stale: boolean;
  /** GeoJSON [lon, lat] route coordinates, road or straight-line. */
  route: LonLat[];
  /** True when the line is a real road route rather than the fallback. */
  routed: boolean;
  /** Fill the parent instead of the card's fixed height. */
  fill?: boolean;
  /** Space covered by what is drawn over the map; see `MapModel`. */
  padTop?: number;
  padBottom?: number;
  controlsBottom?: number;
  hideZoom?: boolean;
  /** Bump to bring the view back to the delivery. */
  recenterKey?: number;
  /** The client panned or zoomed; the map stops following until recentred. */
  onMoved?: () => void;
};

const MAP_HEIGHT = 220;

/**
 * The delivery map on the web build.
 *
 * `react-native-webview` has no web implementation and renders its own red
 * "does not support this platform" notice — an internal string that must never
 * reach a client. The page itself is plain HTML, though, so the browser draws
 * the very same Leaflet document in an iframe: same pins, same route, same
 * last-known-position treatment as `DeliveryMap.native.tsx`.
 */
export function DeliveryMap({
  pickup,
  dropoff,
  rider,
  stale,
  route,
  routed,
  fill,
  padTop,
  padBottom,
  controlsBottom,
  hideZoom,
  recenterKey,
  onMoved,
}: DeliveryMapProps) {
  const theme = useThemeName() === "dark" ? "dark" : "light";
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const ready = useRef(false);

  const model = useMemo(
    () =>
      deliveryMapModel({
        theme,
        pickup: isGeoPoint(pickup) ? pickup : null,
        dropoff: isGeoPoint(dropoff) ? dropoff : null,
        rider: isGeoPoint(rider) ? rider : null,
        stale,
        route,
        routed,
        routeColor: colors.actionYellow,
        pickupLabel: GRIDGO_OFFICE_LABEL,
        padTop,
        padBottom,
        controlsBottom,
        hideZoom,
        recenterKey,
        reduceMotion,
      }),
    [
      theme,
      pickup,
      dropoff,
      rider,
      stale,
      route,
      routed,
      colors.actionYellow,
      padTop,
      padBottom,
      controlsBottom,
      hideZoom,
      recenterKey,
      reduceMotion,
    ],
  );

  // A new document only when the theme flips; everything else is posted in.
  const html = useMemo(() => buildMapHtml(model), [model.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ready.current) frame.current?.contentWindow?.postMessage(JSON.stringify(model), "*");
  }, [model]);

  const moved = useRef(onMoved);
  useEffect(() => {
    moved.current = onMoved;
  }, [onMoved]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const listen = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      if (parseMapMessage(event.data)?.type === "moved") moved.current?.();
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, []);

  return (
    <View style={fill ? { flex: 1 } : { height: MAP_HEIGHT }}>
      {createElement("iframe", {
        ref: frame,
        srcDoc: html,
        // Its own opaque origin: the map page can run its script and open the
        // attribution links, and can reach nothing of the app around it.
        sandbox: "allow-scripts allow-popups",
        title: "Map showing your delivery address and the rider",
        onLoad: () => {
          ready.current = true;
          frame.current?.contentWindow?.postMessage(JSON.stringify(model), "*");
        },
        style: {
          border: 0,
          width: "100%",
          height: "100%",
          display: "block",
          backgroundColor: colors.surfaceVariant,
        },
      })}
    </View>
  );
}
