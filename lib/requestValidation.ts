/**
 * New-request stepper validation.
 *
 * Every field here is captured with the control that matches its data — a
 * picker for values the platform defines, a real date and time picker for the
 * deadline, a stepper for quantity, structured lines for the address. So
 * validation checks facts, not the shape of a typed string, and each step
 * returns an explicit reason rather than a silently disabled button.
 */

import { checkAddress, type AddressParts } from "@/lib/address";
import { checkDeadline } from "@/lib/deadline";
import { quantityBounds } from "@/lib/quantity";

export type RequestStepId = "details" | "artwork" | "review" | "confirm";

export const REQUEST_STEPS: { id: RequestStepId; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "artwork", label: "Artwork" },
  { id: "review", label: "Review" },
  { id: "confirm", label: "Send" },
];

export type RequestDraftFields = {
  productId: string;
  /** Catalog unit — decides the quantity bounds and how a quantity reads. */
  unit: string;
  title: string;
  size: string;
  material: string;
  /** Optional: not every product family has a finish worth choosing. */
  finish: string;
  quantity: number;
  /** ISO instant from the date and time picker. */
  deadline: string;
  addressLine1: string;
  barangay: string;
  landmark: string;
  zone: string;
  /**
   * Server-issued file id. Empty until `POST /files` has returned 201 — a
   * picked file that has not landed is not artwork.
   */
  artworkFileId: string;
  artworkName: string;
};

export type StepValidation = {
  ok: boolean;
  /** Shown under the primary action when the step cannot advance. */
  reason: string | null;
};

function nonEmpty(value: string | null | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function addressPartsOf(draft: RequestDraftFields): AddressParts {
  return {
    line1: draft.addressLine1,
    barangay: draft.barangay,
    landmark: draft.landmark,
  };
}

export function validateDetailsStep(
  draft: RequestDraftFields,
  now: Date | number = Date.now(),
): StepValidation {
  if (!nonEmpty(draft.productId)) {
    return { ok: false, reason: "Choose what you are printing to continue." };
  }
  if (!nonEmpty(draft.title)) {
    return { ok: false, reason: "Name this job so you can find it later — for example “Grand opening tarpaulin”." };
  }
  if (!nonEmpty(draft.size)) {
    return { ok: false, reason: "Choose a size." };
  }
  if (!nonEmpty(draft.material)) {
    return { ok: false, reason: "Choose a material so suppliers quote the same thing." };
  }

  const bounds = quantityBounds(draft.unit);
  if (!Number.isFinite(draft.quantity) || draft.quantity < bounds.min) {
    return { ok: false, reason: `Quantity must be at least ${bounds.min}.` };
  }
  if (draft.quantity > bounds.max) {
    return {
      ok: false,
      reason: `${bounds.max} ${bounds.many} is the most a single request covers. Split larger runs, or ask Operations.`,
    };
  }

  const deadline = checkDeadline(draft.deadline, now);
  if (!deadline.ok) return { ok: false, reason: deadline.reason };

  const address = checkAddress(addressPartsOf(draft));
  if (!address.ok) return { ok: false, reason: address.reason };

  if (!nonEmpty(draft.zone)) {
    return { ok: false, reason: "Choose the delivery area so the fee is right." };
  }

  return { ok: true, reason: null };
}

export function validateArtworkStep(
  draft: Pick<RequestDraftFields, "artworkFileId">,
): StepValidation {
  if (!nonEmpty(draft.artworkFileId)) {
    return {
      ok: false,
      reason: "Upload the artwork you want printed. The file is only attached once the server confirms it.",
    };
  }
  return { ok: true, reason: null };
}

export function validateReviewStep(
  draft: RequestDraftFields,
  now: Date | number = Date.now(),
): StepValidation {
  const details = validateDetailsStep(draft, now);
  if (!details.ok) return details;
  return validateArtworkStep(draft);
}

export function validateConfirmStep(
  draft: RequestDraftFields,
  now: Date | number = Date.now(),
): StepValidation {
  return validateReviewStep(draft, now);
}

export function validateStep(
  step: RequestStepId,
  draft: RequestDraftFields,
  now: Date | number = Date.now(),
): StepValidation {
  switch (step) {
    case "details":
      return validateDetailsStep(draft, now);
    case "artwork":
      return validateArtworkStep(draft);
    case "review":
      return validateReviewStep(draft, now);
    case "confirm":
      return validateConfirmStep(draft, now);
    default:
      return { ok: false, reason: "Unknown step." };
  }
}

/**
 * What the app can actually say about an uploaded file, from the metadata the
 * storage API returns. Print-readiness — bleed, trapping, effective
 * resolution — is judged by Operations, not guessed at here, so it is stated
 * as the next step rather than shown as a row that never resolves.
 */
export type ArtworkFact = {
  id: string;
  label: string;
  value: string;
  /** `warn` where the fact is true but worth a second look before printing. */
  tone: "neutral" | "warn";
};

const PRINTABLE_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG image",
  "image/png": "PNG image",
  "image/webp": "WebP image",
};

/** Below this, a file is very likely a screen-resolution export. */
const THIN_FILE_BYTES = 200 * 1024;

export function describeArtworkFile(file: {
  originalFilename?: string | null;
  detectedContentType?: string | null;
  size?: number | null;
}): ArtworkFact[] {
  const facts: ArtworkFact[] = [];
  if (file.originalFilename) {
    facts.push({ id: "name", label: "File", value: file.originalFilename, tone: "neutral" });
  }
  if (file.detectedContentType) {
    facts.push({
      id: "format",
      label: "Format",
      value: PRINTABLE_TYPES[file.detectedContentType] ?? "Printable file",
      tone: "neutral",
    });
  }
  if (typeof file.size === "number") {
    facts.push({
      id: "size",
      label: "Size",
      value: formatBytes(file.size),
      tone: file.size < THIN_FILE_BYTES ? "warn" : "neutral",
    });
  }
  return facts;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Said once, next to the facts, so a client knows who checks what. */
export const ARTWORK_REVIEW_NOTE =
  "Operations checks bleed, margins, fonts and print resolution after you send this request, and will ask for a corrected file if anything will not print cleanly.";

/** Shown beside a file small enough to be a screen export. */
export const THIN_FILE_NOTE =
  "This file is small for print. If you exported it for screen, send the print-resolution version instead.";
