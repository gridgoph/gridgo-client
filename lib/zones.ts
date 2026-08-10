/**
 * Named parts of Davao, as the platform defines them.
 *
 * `GET /zones` is the source of the code and the name, and that is all a zone
 * is now: delivery is priced by the distance between the supplier's shop and
 * the delivery address, in bands Operations can change without a release. A
 * zone carries no fee, and the app must never imply one.
 */

export type Zone = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export const DEFAULT_ZONE_CODE = "davao_central";

/** Last-known names, used only for labels before `GET /zones` answers. */
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

/** Pick a starting zone: the one already chosen, else central, else the first. */
export function resolveZoneCode(zones: Zone[], preferred: string | null | undefined): string {
  const list = activeZones(zones);
  if (preferred && list.some((zone) => zone.code === preferred)) return preferred;
  if (list.some((zone) => zone.code === DEFAULT_ZONE_CODE)) return DEFAULT_ZONE_CODE;
  return list[0]?.code ?? preferred ?? DEFAULT_ZONE_CODE;
}
