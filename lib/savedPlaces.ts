/**
 * Saved drop-offs, as the client reads them.
 *
 * Grab's information architecture — Home, Work, then named spots — on top of
 * `GET /me/addresses`. Matching is by label, case-insensitive, because a
 * client who typed "home" still meant Home. The API has no PATCH/DELETE on
 * the addresses collection this app talks to, so this module never invents a
 * remove.
 */

import type { ClientAddress } from "@/lib/api";

export const HOME_LABEL = "Home";
export const WORK_LABEL = "Work";

export function isHomeLabel(label: string): boolean {
  return label.trim().toLowerCase() === "home";
}

export function isWorkLabel(label: string): boolean {
  return label.trim().toLowerCase() === "work";
}

export type SavedPlaceGroups = {
  home: ClientAddress | null;
  work: ClientAddress | null;
  named: ClientAddress[];
};

export function groupSavedPlaces(addresses: ClientAddress[]): SavedPlaceGroups {
  let home: ClientAddress | null = null;
  let work: ClientAddress | null = null;
  const named: ClientAddress[] = [];
  for (const address of addresses) {
    if (!home && isHomeLabel(address.label)) {
      home = address;
      continue;
    }
    if (!work && isWorkLabel(address.label)) {
      work = address;
      continue;
    }
    named.push(address);
  }
  return { home, work, named };
}

export function savedPlacesDetail(addresses: ClientAddress[] | null): string {
  if (!addresses || addresses.length === 0) {
    return "Add home, work, and the spots you drop off to";
  }
  const { home, work, named } = groupSavedPlaces(addresses);
  const bits: string[] = [];
  if (home) bits.push(HOME_LABEL);
  if (work) bits.push(WORK_LABEL);
  if (named.length === 1) bits.push(named[0].label);
  else if (named.length > 1) bits.push(`${named.length} saved places`);
  return bits.join(" · ") || "Add home, work, and the spots you drop off to";
}
