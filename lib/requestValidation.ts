/**
 * New-request stepper validation.
 *
 * Each step returns an explicit reason when advance is blocked — never a
 * silent disabled primary button.
 */

export type RequestStepId = "details" | "artwork" | "review" | "confirm";

export const REQUEST_STEPS: { id: RequestStepId; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "artwork", label: "Artwork" },
  { id: "review", label: "Review" },
  { id: "confirm", label: "Confirm" },
];

export type RequestDraftFields = {
  productId: string;
  title: string;
  size: string;
  material: string;
  quantity: number;
  deadline: string;
  address: string;
  zone: string;
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

export function validateDetailsStep(draft: Pick<
  RequestDraftFields,
  "productId" | "size" | "material" | "quantity" | "deadline" | "address"
>): StepValidation {
  if (!nonEmpty(draft.productId)) {
    return { ok: false, reason: "Choose a product from the catalog to continue." };
  }
  if (!nonEmpty(draft.size)) {
    return { ok: false, reason: "Enter a size (for example 3x6 ft or A5)." };
  }
  if (!nonEmpty(draft.material)) {
    return { ok: false, reason: "Enter a material (for example 13oz tarpaulin)." };
  }
  if (!Number.isFinite(draft.quantity) || draft.quantity < 1) {
    return { ok: false, reason: "Quantity must be at least 1." };
  }
  if (!nonEmpty(draft.deadline)) {
    return { ok: false, reason: "Set a deadline so suppliers can plan production." };
  }
  if (!nonEmpty(draft.address)) {
    return { ok: false, reason: "Enter a delivery address in Davao." };
  }
  return { ok: true, reason: null };
}

export function validateArtworkStep(
  draft: Pick<RequestDraftFields, "artworkName">,
): StepValidation {
  if (!nonEmpty(draft.artworkName)) {
    return {
      ok: false,
      reason: "Add an artwork file name. This demo stores the name only — no bytes are uploaded.",
    };
  }
  return { ok: true, reason: null };
}

export function validateReviewStep(draft: RequestDraftFields): StepValidation {
  const details = validateDetailsStep(draft);
  if (!details.ok) return details;
  return validateArtworkStep(draft);
}

export function validateConfirmStep(draft: RequestDraftFields): StepValidation {
  return validateReviewStep(draft);
}

export function validateStep(step: RequestStepId, draft: RequestDraftFields): StepValidation {
  switch (step) {
    case "details":
      return validateDetailsStep(draft);
    case "artwork":
      return validateArtworkStep(draft);
    case "review":
      return validateReviewStep(draft);
    case "confirm":
      return validateConfirmStep(draft);
    default:
      return { ok: false, reason: "Unknown step." };
  }
}

/** Default demo preflight items — presentation only; no real file analysis. */
export type PreflightItem = {
  id: string;
  label: string;
  /** pass | fail | pending based on whether a file name is present. */
  status: "pass" | "fail" | "pending";
};

export function buildPreflightChecklist(artworkName: string | null | undefined): PreflightItem[] {
  const hasFile = nonEmpty(artworkName ?? "");
  return [
    {
      id: "file",
      label: "Artwork file name provided",
      status: hasFile ? "pass" : "fail",
    },
    {
      id: "bleed",
      label: "Bleed and margins (demo — not verified)",
      status: hasFile ? "pending" : "fail",
    },
    {
      id: "fonts",
      label: "Fonts outlined or embedded (demo — not verified)",
      status: hasFile ? "pending" : "fail",
    },
    {
      id: "resolution",
      label: "Image resolution for print (demo — not verified)",
      status: hasFile ? "pending" : "fail",
    },
  ];
}
