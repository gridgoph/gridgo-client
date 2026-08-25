/**
 * Leaflet map HTML for a react-native-webview.
 *
 * OpenStreetMap raster tiles in Light, Carto dark tiles in Dark. No Google
 * Maps and no API key — the same stack `lib/mapHtml.ts` in **gridgo-rider**
 * runs, so the two apps share one map implementation rather than two.
 *
 * The client watches a delivery it does not control, so this map differs from
 * the rider's in two deliberate ways: panning and zooming are the only
 * interactions, and a position the app considers out of date is drawn faded
 * with the reason spelled out in words on the card around it.
 *
 * Attribution is a licence condition — always visible.
 */

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
};

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

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
    .pin {
      display: flex; flex-direction: column; align-items: center;
      transform: translateY(-4px);
    }
    .pin-mark {
      width: 26px; height: 26px;
      display: flex; align-items: center; justify-content: center;
      font: 700 11px/1 system-ui, sans-serif;
      border: 2px solid #1a1a1a;
      box-shadow: 0 1px 3px rgba(0,0,0,0.35);
    }
    /*
      Pins stay monochrome. Yellow is a finite attention budget and on this
      screen it is already spent on the route line.
    */
    .pin-pickup .pin-mark {
      background: #ffffff; color: #1a1a1a;
      border-radius: 4px; /* square — the print shop */
    }
    .pin-dropoff .pin-mark {
      background: #1a1a1a; color: #ffffff;
      border-radius: 999px; /* circle — where it is going */
    }
    .pin-rider .pin-mark {
      width: 16px; height: 16px; border-radius: 999px;
      background: #1565C0; border: 3px solid #fff;
    }
    /* Faded, and never the only signal — the card says "out of date" in words. */
    .pin-rider.is-stale { opacity: 0.4; }
    .pin-label {
      margin-top: 2px; padding: 1px 4px;
      font: 600 9px/1.2 system-ui, sans-serif;
      background: rgba(255,255,255,0.92); color: #1a1a1a;
      border-radius: 3px; white-space: nowrap;
      max-width: 96px; overflow: hidden; text-overflow: ellipsis;
    }
    .dark-attr .pin-label {
      background: rgba(20,20,20,0.92); color: #f0f0f0;
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

    function clearMarkers() {
      markers.forEach(function (m) { map.removeLayer(m); });
      markers = [];
    }

    function pinIcon(kind, shortLabel, stale) {
      var cls = kind === 'pickup' ? 'pin-pickup' : kind === 'rider' ? 'pin-rider' : 'pin-dropoff';
      if (kind === 'rider' && stale) cls += ' is-stale';
      var mark = kind === 'rider' ? '' : shortLabel;
      var labelHtml = kind === 'rider' ? '' : '<div class="pin-label">' + shortLabel + '</div>';
      return L.divIcon({
        className: '',
        html: '<div class="pin ' + cls + '"><div class="pin-mark">' + mark + '</div>' + labelHtml + '</div>',
        iconSize: [40, 44],
        iconAnchor: [20, 36]
      });
    }

    function applyModel(m) {
      MODEL = m;
      var isDark = m.theme === 'dark';
      document.body.className = isDark ? 'dark-attr' : '';
      document.getElementById('route-banner').className =
        'route-banner' + (m.routeUnavailable ? ' show' : '');

      if (!map) {
        map = L.map('map', { zoomControl: false, attributionControl: true });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
      }

      if (tileLayer) map.removeLayer(tileLayer);
      var url = isDark ? ${JSON.stringify(DARK_TILES)} : ${JSON.stringify(LIGHT_TILES)};
      var attr = isDark
        ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
      tileLayer = L.tileLayer(url, { maxZoom: 19, attribution: attr }).addTo(map);

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
          icon: pinIcon('pickup', m.pickupMark || 'Shop', false),
          title: m.pickupLabel || m.pickupMark || 'Shop'
        }).addTo(map));
        bounds.push([m.pickup.lat, m.pickup.lng]);
      }
      if (m.dropoff) {
        markers.push(L.marker([m.dropoff.lat, m.dropoff.lng], {
          icon: pinIcon('dropoff', 'You', false),
          title: m.dropoffLabel || 'Your delivery address'
        }).addTo(map));
        bounds.push([m.dropoff.lat, m.dropoff.lng]);
      }
      if (m.rider) {
        markers.push(L.marker([m.rider.lat, m.rider.lng], {
          icon: pinIcon('rider', '', m.riderStale),
          title: m.riderStale ? 'Rider — last known position' : 'Rider'
        }).addTo(map));
        bounds.push([m.rider.lat, m.rider.lng]);
      }

      // A pick moves one pin the client just put down. Refitting the view
      // there would slide the map out from under their finger.
      if (m.pickable && map.__ggPicked) {
        return;
      }
      if (routeLayer) {
        try { map.fitBounds(routeLayer.getBounds().pad(0.15)); }
        catch (e) { /* keep previous view */ }
      } else if (bounds.length >= 2) {
        map.fitBounds(bounds, { padding: [36, 36] });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 15);
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
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(point));
        }
      });
    }

    applyModel(MODEL);
    bindPicking();

    // Host can push updates without a full HTML reload.
    document.addEventListener('message', function (e) {
      try { applyModel(JSON.parse(e.data)); } catch (err) {}
    });
    window.addEventListener('message', function (e) {
      try { applyModel(JSON.parse(e.data)); } catch (err) {}
    });
  </script>
</body>
</html>`;
}
