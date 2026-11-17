/**
 * The phone's current position, asked for only when the client taps
 * **Use my location**.
 *
 * A pin GRIDGO did not measure is a pin we invented, and delivery is priced
 * from it — so a denial, a missing native module, or a failed read returns
 * copy and no point. Quiet pre-pin is allowed only when permission is already
 * granted and the map is empty; it never raises the system dialog.
 */

import { Platform } from "react-native";

import { LOCATION_NEEDS_REBUILD, getLocationNative } from "@/lib/nativeModules";
import type { GeoPoint } from "@/lib/tracking";

export { LOCATION_NEEDS_REBUILD };

export const LOCATION_DENIED =
  "Location is off for GRIDGO. Search for the place, or tap the map — or allow location in the phone's settings.";

export const LOCATION_UNAVAILABLE =
  "This phone cannot share a location. Search for the place, or tap the map.";

/** How long a satellite fix may take before the network's rougher one is used. */
export const PRECISE_FIX_TIMEOUT_MS = 10000;

/** Bound the network fallback too, so both reads finish within 20 seconds. */
export const FALLBACK_FIX_TIMEOUT_MS = 10000;

export type DeviceLocationResult =
  | {
      status: "ok";
      point: GeoPoint;
      /**
       * The phone's own error radius, in metres, when it reports one. Drawn
       * round the pin so a 120 m network guess is not mistaken for a door.
       */
      accuracyMeters?: number;
    }
  | { status: "denied"; message: string }
  | { status: "unavailable"; message: string };

function pointFromCoords(coords: { latitude: number; longitude: number } | undefined): GeoPoint | null {
  if (!coords) return null;
  const lat = coords.latitude;
  const lng = coords.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

type Reading = { coords?: { latitude: number; longitude: number; accuracy?: number | null } } | null;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function resultFrom(reading: Reading): DeviceLocationResult | null {
  const point = pointFromCoords(reading?.coords);
  if (!point) return null;
  const accuracy = reading?.coords?.accuracy;
  return typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy > 0
    ? { status: "ok", point, accuracyMeters: Math.round(accuracy) }
    : { status: "ok", point };
}

/**
 * A satellite fix first, because delivery is priced from this pin: the
 * Balanced reading this used before is the cell/Wi-Fi guess, often 100 m
 * or more off in Davao — the next street, or the next barangay. Indoors a
 * satellite fix can take a long time, so after `PRECISE_FIX_TIMEOUT_MS`
 * the rougher reading is used and its radius says how rough it is.
 */
async function readPosition(): Promise<DeviceLocationResult> {
  const Location = getLocationNative();
  if (!Location) {
    return { status: "unavailable", message: LOCATION_NEEDS_REBUILD };
  }
  const precise = Location.Accuracy?.Highest ?? Location.Accuracy?.High;
  const rough = Location.Accuracy?.Balanced ?? Location.Accuracy?.Low ?? 2;
  if (precise != null) {
    try {
      const reading = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: precise }) as Promise<Reading>,
        PRECISE_FIX_TIMEOUT_MS,
      );
      const result = resultFrom(reading);
      if (result) return result;
    } catch {
      // Fall back to the rougher reading below.
    }
  }
  try {
    const reading = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: rough }) as Promise<Reading>,
      FALLBACK_FIX_TIMEOUT_MS,
    );
    return resultFrom(reading) ?? { status: "unavailable", message: LOCATION_UNAVAILABLE };
  } catch {
    return { status: "unavailable", message: LOCATION_UNAVAILABLE };
  }
}

type BrowserGeolocation = {
  getCurrentPosition: (
    ok: (position: { coords: { latitude: number; longitude: number; accuracy?: number } }) => void,
    fail: (error: { code: number }) => void,
    options: { enableHighAccuracy: boolean; timeout: number; maximumAge: number },
  ) => void;
};

function browserGeolocation(): BrowserGeolocation | null {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return null;
  return (navigator as unknown as { geolocation?: BrowserGeolocation }).geolocation ?? null;
}

/**
 * The web build asks the browser. There is no native module to rebuild
 * there, so "needs a rebuilt GRIDGO app" was the wrong thing to say. The
 * browser's own prompt is the permission ask, raised only by the tap.
 */
function readBrowserPosition(geo: BrowserGeolocation): Promise<DeviceLocationResult> {
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (position) =>
        resolve(resultFrom({ coords: position.coords }) ?? { status: "unavailable", message: LOCATION_UNAVAILABLE }),
      (error) =>
        resolve(
          error.code === 1
            ? { status: "denied", message: LOCATION_DENIED }
            : { status: "unavailable", message: LOCATION_UNAVAILABLE },
        ),
      { enableHighAccuracy: true, timeout: PRECISE_FIX_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

async function browserGranted(): Promise<boolean> {
  try {
    const permissions = (navigator as unknown as {
      permissions?: { query: (input: { name: string }) => Promise<{ state: string }> };
    }).permissions;
    return (await permissions?.query({ name: "geolocation" }))?.state === "granted";
  } catch {
    return false;
  }
}

/**
 * Current position if — and only if — the phone has already granted it.
 * Never prompts. Used to pre-pin an empty map.
 */
export async function peekCurrentLocation(): Promise<DeviceLocationResult | null> {
  const geo = browserGeolocation();
  if (geo) return (await browserGranted()) ? readBrowserPosition(geo) : null;
  const Location = getLocationNative();
  if (!Location) return null;
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;
    return readPosition();
  } catch {
    return null;
  }
}

/** Request permission (on tap) and, if granted, read the position. */
export async function requestCurrentLocation(): Promise<DeviceLocationResult> {
  const geo = browserGeolocation();
  if (geo) return readBrowserPosition(geo);
  const Location = getLocationNative();
  if (!Location) {
    return { status: "unavailable", message: LOCATION_NEEDS_REBUILD };
  }
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return { status: "denied", message: LOCATION_DENIED };
    }
    return readPosition();
  } catch {
    return { status: "unavailable", message: LOCATION_UNAVAILABLE };
  }
}
