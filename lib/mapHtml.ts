/**
 * Leaflet map HTML for a react-native-webview.
 *
 * OpenStreetMap raster tiles in Light, Carto dark tiles in Dark. No Google
 * Maps — the same stack `lib/mapHtml.ts` in **gridgo-rider** runs. Dark Carto
 * tiles take `EXPO_PUBLIC_CARTO_API_KEY` from gitignored env.
 *
 * Destination pins use the rider's teardrop (`PIN_PATH`, tip on the coordinate,
 * contact shadow so it stands on the street). Drop-off is the client skin:
 * white fill, charcoal stroke. Yellow stays on the route, not on this pin.
 *
 * The client watches a delivery it does not control, so this map differs from
 * the rider's in two deliberate ways: panning and zooming are the only
 * interactions, and a position the app considers out of date is drawn faded
 * with the reason spelled out in words on the card around it.
 *
 * Attribution is a licence condition — always visible.
 */

import { cartoDarkTileUrl } from "@/lib/cartoTiles";
import type { GeoPoint, LonLat } from "@/lib/tracking";

export type MapTheme = "light" | "dark";

export type MapModel = {
  theme: MapTheme;
  /** Where the job starts its journey, once there is one. */
  pickup: GeoPoint | null;
  /** Where the client is having it delivered. */
  dropoff: GeoPoint | null;
  pickupLabel: string;
  /**
   * The word written on the pickup pin itself.
   *
   * Each app names this point for whoever is reading the map — the rider is
   * going to a shop, a GRIDGO client is dealing with GRIDGO — so the pin's
   * short label is the model's rather than this file's. Defaults to "Shop", so
   * the fleet's other copies of this file behave exactly as they did.
   */
  pickupMark?: string;
  dropoffLabel: string;
  /** GeoJSON LineString coordinates [lon, lat][]. */
  routeCoordinates: LonLat[];
  /** Route stroke — the design system's actionYellow, which the map may use. */
  routeColor: string;
  rider: GeoPoint | null;
  /** Draws the rider faded, so an old pin never looks like a live one. */
  riderStale: boolean;
  /** When true, show an on-map note that routing failed. */
  routeUnavailable: boolean;
  /**
   * Let a tap on the map set the drop-off.
   *
   * Off everywhere the client is watching a delivery — the client watches, and
   * a stray tap must not look like it moved anything. On only where the client
   * is being asked where the job goes, and the tapped point is posted straight
   * back to the host as `{ type: "pin", lat, lng }`.
   */
  pickable?: boolean;
  /**
   * Screen space covered by something drawn over the map — the delivery
   * screen's panel at the bottom, its status card at the top — so fitting the
   * view keeps every pin in the part a person can actually see.
   */
  padTop?: number;
  padBottom?: number;
  /**
   * Where the zoom buttons and the attribution sit above the bottom edge, when
   * that differs from `padBottom` — a panel pulled up over the map leaves only
   * a strip, and the attribution (a licence condition) moves into it.
   */
  controlsBottom?: number;
  /** Hide the zoom buttons where there is no room for them. */
  hideZoom?: boolean;
  /**
   * Bumped by the host to bring the view back to the delivery after the
   * client panned or zoomed away. Until then, a newer position moves the
   * rider without yanking the map out from under their finger.
   */
  recenterKey?: number;
  /** No pulse around the live rider. */
  reduceMotion?: boolean;
};

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Injected into the live Leaflet page so an external pin pans without a reload.
 */
export function externalPinScript(point: GeoPoint): string {
  return `try { setExternalPin(${Number(point.lat)}, ${Number(point.lng)}); } catch (e) {} true;`;
}

/**
 * Build the full HTML document for the WebView.
 * Leaflet is loaded from unpkg (the same connectivity bar as the OSM tiles).
 */
export function buildMapHtml(model: MapModel): string {
  const payload = JSON.stringify(model);
  // Escape for embedding inside a <script> as a JSON assignment.
  const safe = payload.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <!--
    Subresource Integrity on both Leaflet files. The WebView runs third-party
    script inside the app, so a compromised or swapped CDN response would run
    with it; these hashes mean the browser refuses anything but the exact
    1.9.4 bytes. Recompute with:
      curl -s https://unpkg.com/leaflet@1.9.4/dist/leaflet.js \\
        | openssl dgst -sha384 -binary | openssl base64 -A
  -->
  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H"
    crossorigin="anonymous"
  />
  <script
    src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH"
    crossorigin="anonymous"
  ></script>
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #f0f0f0; }
    body.dark-attr, body.dark-attr #map { background: #1e1e1e; }
    .leaflet-control-attribution {
      font-size: 10px !important;
      background: rgba(255,255,255,0.85) !important;
      color: #1a1a1a !important;
      max-width: 70%;
    }
    .dark-attr .leaflet-control-attribution {
      background: rgba(20,20,20,0.9) !important;
      color: #f0f0f0 !important;
    }
    .leaflet-div-icon { background: transparent; border: 0; }
    /*
      A destination is a pin, not a plate.

      Same teardrop as gridgo-rider: the tip is the coordinate, and a blurred
      contact shadow makes it stand on the street. Drop-off is paper (the
      client's door). Pickup is ink. Yellow is the route, not these pins.
    */
    .pin {
      display: flex; flex-direction: column; align-items: center;
      width: 34px;
    }
    .pin-stack { position: relative; width: 34px; height: 48px; }
    .pin-head {
      position: relative; z-index: 3;
      display: block; width: 34px; height: 48px;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,0.30));
      transform-origin: 50% 94%;
    }
    .dark-attr .pin-head {
      filter: drop-shadow(0 0 1.5px rgba(255,255,255,0.45))
              drop-shadow(0 2px 4px rgba(0,0,0,0.6));
    }
    .pin-tip {
      position: absolute; z-index: 1;
      left: 50%; bottom: 1px;
      width: 16px; height: 5px; margin-left: -8px;
      border-radius: 999px;
      background: rgba(0,0,0,0.32);
      filter: blur(2px);
    }
    .dark-attr .pin-tip { background: rgba(0,0,0,0.6); }
    .pin-rider {
      position: relative;
      width: 20px; height: 20px;
      display: flex; flex-direction: column; align-items: center;
    }
    .pin-rider .pin-mark {
      position: relative; z-index: 2;
      width: 20px; height: 20px; border-radius: 999px; box-sizing: border-box;
      background: #1565C0; border: 3px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
    }
    /* Live, the rider breathes; the pill above the map says "Live" in words. */
    .pin-rider .pin-halo {
      position: absolute; z-index: 1; left: 50%; top: 50%;
      width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 999px;
      background: rgba(21,101,192,0.35);
      animation: halo 2s ease-out infinite;
    }
    @keyframes halo {
      from { transform: scale(1); opacity: 0.9; }
      to { transform: scale(3.2); opacity: 0; }
    }
    .pin-rider.is-still .pin-halo { display: none; }
    .pin-rider.is-stale .pin-mark { background: #7A7A7A; opacity: 0.75; }
    .pin-rider.is-stale .pin-halo { display: none; }
    .pin-rider .pin-label { position: absolute; top: 22px; }
    /* Names a place, never an address — the street lines are on the form. */
    .pin-label {
      margin-top: 6px; padding: 3px 7px;
      font: 700 10px/1.25 system-ui, -apple-system, sans-serif;
      background: rgba(255,255,255,0.96); color: #1a1a1a;
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 7px; white-space: nowrap;
      max-width: 132px; overflow: hidden; text-overflow: ellipsis;
      box-shadow: 0 3px 8px rgba(0,0,0,0.20);
    }
    .dark-attr .pin-label {
      background: rgba(18,18,18,0.94); color: #f0f0f0;
      border-color: rgba(255,255,255,0.14);
      box-shadow: 0 3px 10px rgba(0,0,0,0.5);
    }
    .route-banner {
      position: absolute; top: 8px; left: 8px; right: 8px; z-index: 1000;
      padding: 6px 10px; border-radius: 8px;
      font: 600 12px/1.3 system-ui, sans-serif;
      background: rgba(255,255,255,0.95); color: #1a1a1a;
      border: 1px solid #dcdcdc;
      display: none;
    }
    .dark-attr .route-banner {
      background: rgba(20,20,20,0.95); color: #f0f0f0; border-color: #2e2e2e;
    }
    .route-banner.show { display: block; }
  </style>
</head>
<body>
  <div id="route-banner" class="route-banner" role="status">Route unavailable — straight line shown</div>
  <div id="map"></div>
  <script>
    var MODEL = ${safe};
    var map = null;
    var tileLayer = null;
    var routeLayer = null;
    var markers = [];
    // The client moved the map themselves; stop fitting it until they ask.
    // Read from their input, not from Leaflet's move events: a refit fires
    // those too, and would look like the client's own pan.
    var userMoved = false;
    var recenterKey = null;

    function userMove() {
      if (userMoved) return;
      userMoved = true;
      notify({ type: 'moved' });
    }

    function notify(message) {
      var text = JSON.stringify(message);
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
      else if (window.parent && window.parent !== window) window.parent.postMessage(text, '*');
    }

    function fitOptions(m) {
      var top = 36 + (m.padTop || 0);
      var bottom = 36 + (m.padBottom || 0);
      return { paddingTopLeft: [36, top], paddingBottomRight: [36, bottom], maxZoom: 17 };
    }

    function clearMarkers() {
      markers.forEach(function (m) { map.removeLayer(m); });
      markers = [];
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    var PIN_SKIN = {
      pickup: { cls: 'pin-pickup', fill: '#1a1a1a', stroke: '#ffffff', ink: '#ffffff', width: 2 },
      client: { cls: 'pin-client', fill: '#FFFFFF', stroke: '#1a1a1a', ink: '#1a1a1a', width: 2 }
    };

    var PIN_PATH = 'M17 45.6C17 45.6 3.2 27.9 3.2 17.6A13.8 13.8 0 1 1 30.8 17.6C30.8 27.9 17 45.6 17 45.6Z';

    function pinSkinFor(kind) {
      if (kind === 'client' || kind === 'dropoff') return 'client';
      return 'pickup';
    }

    /** A pin names a place; the street lines belong on the card below it. */
    function pinCaption(value) {
      var text = String(value == null ? '' : value).trim();
      if (!text) return '';
      var comma = text.indexOf(',');
      return comma > 0 ? text.slice(0, comma).trim() : text;
    }

    function pinHead(skin, glyph) {
      var wide = glyph.length > 1;
      var glyphHtml = glyph
        ? '<text x="17" y="17" dy="0.35em" text-anchor="middle"'
          + ' font-family="system-ui, -apple-system, sans-serif"'
          + ' font-size="' + (wide ? 11 : 14) + '" font-weight="800"'
          + ' letter-spacing="' + (wide ? '0.3' : '0') + '"'
          + ' fill="' + skin.ink + '">' + escapeHtml(glyph) + '</text>'
        : '';
      return '<svg class="pin-head" viewBox="0 0 34 48" xmlns="http://www.w3.org/2000/svg">'
        + '<path d="' + PIN_PATH + '" fill="' + skin.fill + '" stroke="' + skin.stroke
        + '" stroke-width="' + skin.width + '" stroke-linejoin="round"/>'
        + glyphHtml
        + '</svg>';
    }

    function pinIcon(kind, shortLabel, stale, longLabel) {
      if (kind === 'rider') {
        var cls = 'pin pin-rider' + (stale ? ' is-stale' : '') + (MODEL.reduceMotion ? ' is-still' : '');
        // An old position says so on the map itself, not only by fading.
        var known = stale ? '<div class="pin-label">Last known position</div>' : '';
        return L.divIcon({
          className: '',
          html: '<div class="' + cls + '"><div class="pin-halo"></div><div class="pin-mark"></div>' + known + '</div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
      }

      var skin = PIN_SKIN[pinSkinFor(kind)];
      var cls = 'pin ' + skin.cls;
      var caption = pinCaption(longLabel === '' ? '' : (longLabel || shortLabel));
      var labelHtml = caption ? '<div class="pin-label">' + escapeHtml(caption) + '</div>' : '';
      return L.divIcon({
        className: '',
        html: '<div class="' + cls + '">'
          + '<div class="pin-stack">'
          + '<div class="pin-tip"></div>'
          + pinHead(skin, String(shortLabel == null ? '' : shortLabel))
          + '</div>'
          + labelHtml
          + '</div>',
        iconSize: [34, 48],
        iconAnchor: [17, 45]
      });
    }

    function applyModel(m) {
      MODEL = m;
      var isDark = m.theme === 'dark';
      document.body.className = isDark ? 'dark-attr' : '';
      document.getElementById('route-banner').className =
        'route-banner' + (m.routeUnavailable ? ' show' : '');
      document.getElementById('route-banner').style.top = (8 + (m.padTop || 0)) + 'px';

      if (!map) {
        map = L.map('map', { zoomControl: false, attributionControl: true });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        map.on('dragstart', userMove);
        map.on('dblclick', userMove);
        var surface = map.getContainer();
        surface.addEventListener('wheel', userMove, { passive: true });
        surface.addEventListener('touchstart', function (e) {
          if (e.touches && e.touches.length > 1) userMove();
        }, { passive: true });
        var zoomButtons = surface.querySelectorAll('.leaflet-control-zoom a');
        for (var i = 0; i < zoomButtons.length; i++) zoomButtons[i].addEventListener('click', userMove);
      }
      if (m.recenterKey != null && m.recenterKey !== recenterKey) {
        if (recenterKey !== null) userMoved = false;
        recenterKey = m.recenterKey;
      }
      // The zoom buttons sit above the panel, not under it.
      var controlsBottom = (m.controlsBottom != null ? m.controlsBottom : m.padBottom) || 0;
      var cornerBox = document.querySelector('.leaflet-bottom.leaflet-right');
      if (cornerBox) cornerBox.style.marginBottom = controlsBottom + 'px';
      var zoomControl = document.querySelector('.leaflet-control-zoom');
      if (zoomControl) zoomControl.style.display = m.hideZoom ? 'none' : '';

      var url = isDark ? ${JSON.stringify(cartoDarkTileUrl())} : ${JSON.stringify(LIGHT_TILES)};
      var attr = isDark
        ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
      // Rebuild tiles only when the URL actually changes (a theme flip). A
      // pin update from search / Use my location must not reload the set.
      if (!tileLayer || tileLayer._url !== url) {
        if (tileLayer) map.removeLayer(tileLayer);
        tileLayer = L.tileLayer(url, { maxZoom: 19, attribution: attr }).addTo(map);
      }

      if (routeLayer) map.removeLayer(routeLayer);
      routeLayer = null;
      if (m.routeCoordinates && m.routeCoordinates.length >= 2) {
        // GeoJSON is [lon, lat]; Leaflet latLng expects [lat, lon].
        var latlngs = m.routeCoordinates.map(function (c) { return [c[1], c[0]]; });
        routeLayer = L.polyline(latlngs, {
          color: m.routeColor || '#FFDE58',
          weight: 5,
          opacity: m.riderStale ? 0.45 : 0.95,
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(map);
      }

      clearMarkers();
      var bounds = [];
      if (m.pickup) {
        markers.push(L.marker([m.pickup.lat, m.pickup.lng], {
          icon: pinIcon('pickup', m.pickupMark || 'Shop', false, m.pickupLabel || ''),
          title: m.pickupLabel || m.pickupMark || 'Shop'
        }).addTo(map));
        bounds.push([m.pickup.lat, m.pickup.lng]);
      }
      if (m.dropoff) {
        markers.push(L.marker([m.dropoff.lat, m.dropoff.lng], {
          icon: pinIcon('dropoff', '', false, m.pickable ? '' : (m.dropoffLabel || '')),
          title: m.dropoffLabel || 'Your delivery address'
        }).addTo(map));
        bounds.push([m.dropoff.lat, m.dropoff.lng]);
      }
      if (m.rider) {
        markers.push(L.marker([m.rider.lat, m.rider.lng], {
          icon: pinIcon('rider', '', m.riderStale, ''),
          title: m.riderStale ? 'Rider — last known position' : 'Rider'
        }).addTo(map));
        bounds.push([m.rider.lat, m.rider.lng]);
      }

      // A pick moves one pin the client just put down. Refitting the view
      // there would slide the map out from under their finger.
      if (m.pickable && map.__ggPicked) {
        return;
      }
      if (userMoved) return;
      if (routeLayer) {
        try { map.fitBounds(routeLayer.getBounds(), fitOptions(m)); }
        catch (e) { /* keep previous view */ }
      } else if (bounds.length >= 2) {
        map.fitBounds(bounds, fitOptions(m));
      } else if (bounds.length === 1) {
        var only = L.latLngBounds([bounds[0], bounds[0]]);
        map.fitBounds(only, Object.assign(fitOptions(m), { maxZoom: 15 }));
      } else {
        // Davao City centre fallback so an empty model still shows a map.
        map.setView([7.1907, 125.4553], 12);
      }
    }

    // Tap-to-pin. Registered once; whether it does anything is read from the
    // current model at tap time, so switching the flag needs no page rebuild.
    function bindPicking() {
      if (!map || map.__ggPickBound) return;
      map.__ggPickBound = true;
      map.on('click', function (e) {
        if (!MODEL.pickable) return;
        var point = { type: 'pin', lat: e.latlng.lat, lng: e.latlng.lng };
        MODEL.dropoff = { lat: point.lat, lng: point.lng };
        map.__ggPicked = true;
        applyModel(MODEL);
        notify(point);
      });
    }

    applyModel(MODEL);
    bindPicking();

    // Search / Use my location set the pin from JS. Clear the tap-guard so
    // the map pans to the new point; a finger-tap still skips that pan.
    function setExternalPin(lat, lng) {
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      if (!isFinite(lat) || !isFinite(lng)) return;
      MODEL.dropoff = { lat: lat, lng: lng };
      if (map) map.__ggPicked = false;
      applyModel(MODEL);
    }

    // Host can push updates without a full HTML reload.
    document.addEventListener('message', function (e) {
      try { applyModel(JSON.parse(e.data)); } catch (err) {}
    });
    window.addEventListener('message', function (e) {
      // In a browser frame, only the page that drew this map may redraw it.
      if (window.parent !== window && e.source !== window.parent) return;
      try { applyModel(JSON.parse(e.data)); } catch (err) {}
    });
  </script>
</body>
</html>`;
}

/** What the delivery screen hands its map; see `components/DeliveryMap.tsx`. */
export type DeliveryMapInput = {
  theme: MapTheme;
  pickup: GeoPoint | null;
  dropoff: GeoPoint | null;
  rider: GeoPoint | null;
  stale: boolean;
  route: LonLat[];
  routed: boolean;
  routeColor: string;
  /** The origin pin's caption: GRIDGO's counter, never a shop. */
  pickupLabel: string;
  padTop?: number;
  padBottom?: number;
  controlsBottom?: number;
  hideZoom?: boolean;
  recenterKey?: number;
  reduceMotion?: boolean;
};

/**
 * The model both map hosts push into the page — the WebView on a phone and
 * the iframe on the web — so the two can never draw a delivery differently.
 */
export function deliveryMapModel(input: DeliveryMapInput): MapModel {
  return {
    theme: input.theme,
    pickup: input.pickup,
    dropoff: input.dropoff,
    pickupLabel: input.pickup?.label || input.pickupLabel,
    pickupMark: "GRIDGO",
    dropoffLabel: input.dropoff?.label || "Your delivery address",
    routeCoordinates: input.route,
    routeColor: input.routeColor,
    rider: input.rider,
    riderStale: input.stale,
    // Only worth saying once the app actually tried to route.
    routeUnavailable: input.route.length >= 2 && !input.routed,
    padTop: input.padTop ?? 0,
    padBottom: input.padBottom ?? 0,
    controlsBottom: input.controlsBottom,
    hideZoom: input.hideZoom ?? false,
    recenterKey: input.recenterKey ?? 0,
    reduceMotion: input.reduceMotion ?? false,
  };
}

/** A message the map page posts back: a tap that set a pin, or the client moving the view. */
export type MapMessage = { type: "pin"; lat: number; lng: number } | { type: "moved" };

export function parseMapMessage(data: unknown): MapMessage | null {
  if (typeof data !== "string") return null;
  try {
    const value = JSON.parse(data) as { type?: unknown; lat?: unknown; lng?: unknown };
    if (value.type === "moved") return { type: "moved" };
    if (value.type === "pin" && typeof value.lat === "number" && typeof value.lng === "number") {
      return { type: "pin", lat: value.lat, lng: value.lng };
    }
  } catch {
    // Anything else on the channel is not ours.
  }
  return null;
}
