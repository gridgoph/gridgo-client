/**
 * What the row under the drop-off map says about the pin.
 *
 * The row is the confirmation: before anything is saved, the client reads
 * the street GRIDGO will send the rider to and whether the pin is on a door
 * or only somewhere near one. Pure, so every state is tested without a map.
 */

import { OUTSIDE_DAVAO, READING_PLACE, type PinPrecision } from "@/lib/geocode";

/** The picker map's height: the street around the pin, with Save still in reach. */
export const PIN_MAP_HEIGHT = 300;

/** Above this, a phone's fix is a neighbourhood, not a gate. */
export const ROUGH_FIX_METERS = 30;

export const PIN_EMPTY_TITLE = "Tap the map where it goes";
export const PIN_EMPTY_DETAIL = "Or search, or use your location.";
export const FINDING_YOU = "Finding you…";
export const OUTSIDE_TITLE = "Outside Davao City";
export const STREET_UNNAMED_TITLE = "No street name on the map here";
export const STREET_UNNAMED_DETAIL = "Type the street below so the rider can find it.";
export const DRAG_TO_DOOR = "Drag the pin onto the exact door.";

export type PinTone = "empty" | "busy" | "set" | "error";

export type PinStatus = {
  tone: PinTone;
  title: string;
  detail?: string;
  /** What the rider looks for, drawn on its own line beside a flag. */
  landmark?: string;
  /** A nudge to move the pin, when it is not yet on a door. */
  hint?: string;
};

export type PinStatusInput = {
  hasPoint: boolean;
  locating: boolean;
  reversing: boolean;
  outside: boolean;
  streetUnread: boolean;
  /** The street line as it stands — typed or read from the map. */
  line1: string;
  landmark: string;
  /** The longer address OSM gave, shown under the street. */
  completeAddress: string;
  /** From Use my location; null once the client places the pin by hand. */
  accuracyMeters: number | null;
  /** From search; null once the client places the pin by hand. */
  precision: PinPrecision | null;
  /** The searched place's name, for "the middle of Talomo". */
  placeName: string;
};

function precisionHint(input: PinStatusInput): string | undefined {
  if (input.accuracyMeters != null && input.accuracyMeters > ROUGH_FIX_METERS) {
    return `Your phone placed this within about ${input.accuracyMeters} m. ${DRAG_TO_DOOR}`;
  }
  if (input.precision === "area") {
    return input.placeName
      ? `This is the middle of ${input.placeName}. ${DRAG_TO_DOOR}`
      : DRAG_TO_DOOR;
  }
  if (input.precision === "street") {
    return `The pin is on one stretch of this road. ${DRAG_TO_DOOR}`;
  }
  return undefined;
}

/** Drops the street from the front of OSM's longer line, so it is not said twice. */
function areaAfterStreet(complete: string, line1: string): string {
  let full = complete.trim();
  const street = line1.trim();
  if (!full) return "";
  if (street && full.toLowerCase().startsWith(street.toLowerCase())) {
    full = full.slice(street.length).replace(/^[,\s]+/, "");
  }
  // "Talomo District" is an administrative layer nobody gives directions by.
  return full
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !/\bdistrict$/i.test(part))
    .join(", ");
}

export function pinStatus(input: PinStatusInput): PinStatus {
  if (input.locating) return { tone: "busy", title: FINDING_YOU };
  if (!input.hasPoint) return { tone: "empty", title: PIN_EMPTY_TITLE, detail: PIN_EMPTY_DETAIL };
  if (input.outside) return { tone: "error", title: OUTSIDE_TITLE, detail: OUTSIDE_DAVAO };
  if (input.reversing) return { tone: "busy", title: READING_PLACE };

  const hint = precisionHint(input);
  const street = input.line1.trim();
  if (!street) {
    if (input.precision === "area" && input.placeName) {
      return { tone: "set", title: input.placeName, detail: STREET_UNNAMED_DETAIL, hint };
    }
    return { tone: "set", title: STREET_UNNAMED_TITLE, detail: STREET_UNNAMED_DETAIL, hint };
  }

  const area = areaAfterStreet(input.completeAddress, street);
  const landmark = input.landmark.trim();
  return {
    tone: "set",
    title: street,
    detail: area || undefined,
    landmark: landmark || undefined,
    hint,
  };
}
