/**
 * Structured delivery address.
 *
 * The order record keeps one `address` string, so the app composes it from
 * the street line a rider can actually use, an optional landmark, and the
 * city. City is fixed — GRIDGO delivers inside Davao City only. Barangay is
 * not asked for: a pin plus a street is enough to price the drop-off, and
 * Davao riders already work from that.
 *
 * Street lines and landmarks are genuinely free text; the structure is what
 * makes them useful, not a picker.
 */

export const DELIVERY_CITY = "Davao City";

/** `POST /me/addresses` refuses a label longer than this. */
export const ADDRESS_LABEL_MAX = 80;

export type AddressParts = {
  /** House / building number and street. */
  line1: string;
  /**
   * Kept so an old stored string can still be split on reorder. Nothing in
   * the app requires one, and new addresses do not write one.
   */
  barangay: string;
  /** Optional: "beside the blue gate", "2nd floor, Insular Building". */
  landmark: string;
};

export const EMPTY_ADDRESS: AddressParts = { line1: "", barangay: "", landmark: "" };

/** One line, in the order a rider reads it. */
export function composeAddress(parts: AddressParts): string {
  const core = [parts.line1.trim(), DELIVERY_CITY].filter(Boolean).join(", ");
  const landmark = parts.landmark.trim();
  return landmark ? `${core} (${landmark})` : core;
}

/**
 * Best-effort split of a stored address back into parts, so reordering a past
 * job pre-fills the structured fields instead of dropping the client into a
 * blank form. Anything it cannot place stays on the street line, where the
 * client can see and correct it.
 *
 * A trailing barangay segment is still read — older jobs wrote one — but it
 * is never required to save.
 */
export function parseAddress(stored: string | null | undefined): AddressParts {
  const raw = (stored ?? "").trim();
  if (!raw) return { ...EMPTY_ADDRESS };

  let body = raw;
  let landmark = "";
  const landmarkMatch = body.match(/\(([^)]*)\)\s*$/);
  if (landmarkMatch) {
    landmark = landmarkMatch[1].trim();
    body = body.slice(0, landmarkMatch.index).trim();
  }

  const segments = body
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  // Drop a trailing city segment however it was capitalised.
  if (segments.length && segments[segments.length - 1].toLowerCase() === DELIVERY_CITY.toLowerCase()) {
    segments.pop();
  }

  if (!segments.length) return { line1: "", barangay: "", landmark };
  if (segments.length === 1) return { line1: segments[0], barangay: "", landmark };

  const barangay = segments.pop() as string;
  return { line1: segments.join(", "), barangay, landmark };
}

export type AddressCheck = {
  ok: boolean;
  /** Which field to fix, so the screen can point at it. */
  field: keyof AddressParts | null;
  reason: string | null;
};

export function checkAddress(parts: AddressParts): AddressCheck {
  if (!parts.line1.trim()) {
    return {
      ok: false,
      field: "line1",
      reason: "Add the street and number so the rider can find the drop-off.",
    };
  }
  return { ok: true, field: null, reason: null };
}
