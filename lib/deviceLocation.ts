/**
 * The phone's current position, asked for only when the client taps
 * **Use my location**.
 *
 * A pin GRIDGO did not measure is a pin we invented, and delivery is priced
 * from it — so a denial, a missing native module, or a failed read returns
 * copy and no point. Quiet pre-pin is allowed only when permission is already
 * granted and the map is empty; it never raises the system dialog.
 */

import { LOCATION_NEEDS_REBUILD, getLocationNative } from "@/lib/nativeModules";
import type { GeoPoint } from "@/lib/tracking";

export { LOCATION_NEEDS_REBUILD };

export const LOCATION_DENIED =
  "Location is off for GRIDGO. Search for the place, or tap the map — or allow location in the phone's settings.";

export const LOCATION_UNAVAILABLE =
  "This phone cannot share a location. Search for the place, or tap the map.";

export type DeviceLocationResult =
  | { status: "ok"; point: GeoPoint }
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

async function readPosition(): Promise<DeviceLocationResult> {
  const Location = getLocationNative();
  if (!Location) {
    return { status: "unavailable", message: LOCATION_NEEDS_REBUILD };
  }
  try {
    const accuracy = Location.Accuracy?.Balanced ?? Location.Accuracy?.Low ?? 2;
    const reading = await Location.getCurrentPositionAsync({ accuracy });
    const point = pointFromCoords(reading?.coords);
    if (!point) return { status: "unavailable", message: LOCATION_UNAVAILABLE };
    return { status: "ok", point };
  } catch {
    return { status: "unavailable", message: LOCATION_UNAVAILABLE };
  }
}

/**
 * Current position if — and only if — the phone has already granted it.
 * Never prompts. Used to pre-pin an empty map.
 */
export async function peekCurrentLocation(): Promise<DeviceLocationResult | null> {
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
