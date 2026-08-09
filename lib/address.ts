/**
 * Structured delivery address.
 *
 * The order record keeps one `address` string, so the app composes it from
 * parts a rider can actually use: street line, barangay, and an optional
 * landmark. City is fixed — GRIDGO delivers inside Davao City only — and the
 * delivery zone is chosen separately from the list the API serves.
 *
 * Street lines, barangay names and landmarks are genuinely free text; the
 * structure is what makes them useful, not a picker.
 */

export const DELIVERY_CITY = "Davao City";

export type AddressParts = {
  /** House / building number and street. */
  line1: string;
  barangay: string;
  /** Optional: "beside the blue gate", "2nd floor, Insular Building". */
  landmark: string;
};

export const EMPTY_ADDRESS: AddressParts = { line1: "", barangay: "", landmark: "" };

/** One line, in the order a rider reads it. */
export function composeAddress(parts: AddressParts): string {
  const core = [parts.line1.trim(), parts.barangay.trim(), DELIVERY_CITY]
    .filter(Boolean)
    .join(", ");
  const landmark = parts.landmark.trim();
  return landmark ? `${core} (${landmark})` : core;
}

/**
 * Best-effort split of a stored address back into parts, so reordering a past
 * job pre-fills the structured fields instead of dropping the client into a
 * blank form. Anything it cannot place stays on the street line, where the
 * client can see and correct it.
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
  if (!parts.barangay.trim()) {
    return {
      ok: false,
      field: "barangay",
      reason: "Add the barangay — Davao street names repeat across barangays.",
    };
  }
  return { ok: true, field: null, reason: null };
}
