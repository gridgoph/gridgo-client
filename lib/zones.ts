/**
 * Delivery zones, as the platform defines them.
 *
 * `GET /zones` is the source of the code, the name and the delivery fee. The
 * fallback below only exists so a zone name and a fee are never blank while
 * the list is still loading or the request failed — it is clearly marked as an
 * estimate wherever a real fee has not arrived.
 */

export type Zone = {
  id: string;
  code: string;
  name: string;
  deliveryFeeMinor: number;
  active: boolean;
};

export const DEFAULT_ZONE_CODE = "davao_central";

/**
 * Last-known zone shape, used only for labels before `GET /zones` answers.
 * Fees are deliberately absent: a delivery fee is money and must come from
 * the API, never from a constant in the app.
 */
const FALLBACK_NAMES: Record<string, string> = {
  davao_central: "Davao Central",
  davao_north: "Davao North",
  davao_south: "Davao South",
  davao_east: "Davao East",
  davao_west: "Davao West",
};

export function activeZones(zones: Zone[]): Zone[] {
  return zones.filter((zone) => zone.active);
}

export function findZone(zones: Zone[], code: string | null | undefined): Zone | null {
  if (!code) return null;
  return zones.find((zone) => zone.code === code) ?? null;
}

/** Human name for a zone code, with a safe label before zones load. */
export function zoneName(zones: Zone[], code: string | null | undefined): string {
  if (!code) return "—";
  const zone = findZone(zones, code);
  if (zone) return zone.name;
  return FALLBACK_NAMES[code] ?? "Davao area";
}

/**
 * Delivery fee for a zone, or null when the API has not said.
 * A null fee must read as "confirmed when the job is matched", never as ₱0.00.
 */
export function zoneDeliveryFeeMinor(
  zones: Zone[],
  code: string | null | undefined,
): number | null {
  const zone = findZone(zones, code);
  return zone ? zone.deliveryFeeMinor : null;
}

/** Pick a starting zone: the one already chosen, else central, else the first. */
export function resolveZoneCode(zones: Zone[], preferred: string | null | undefined): string {
  const list = activeZones(zones);
  if (preferred && list.some((zone) => zone.code === preferred)) return preferred;
  if (list.some((zone) => zone.code === DEFAULT_ZONE_CODE)) return DEFAULT_ZONE_CODE;
  return list[0]?.code ?? preferred ?? DEFAULT_ZONE_CODE;
}
