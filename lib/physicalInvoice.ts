/**
 * Asking GRIDGO for a printed invoice at an office, not at the door.
 *
 * Used when the rider will not find anyone at the drop-off to take a
 * physical copy. The request is the contact, the office, and when someone
 * is there — nothing else.
 */

export const PHYSICAL_INVOICE_CONTACT_MAX = 80;
export const PHYSICAL_INVOICE_ADDRESS_MAX = 240;
export const PHYSICAL_INVOICE_HOURS_MAX = 80;

export const PHYSICAL_INVOICE_BLURB =
  "Use this when nobody will be at the drop-off to take a printed invoice. GRIDGO will send it to this office instead.";

export type PhysicalInvoiceDraft = {
  contactPerson: string;
  officeAddress: string;
  operatingHours: string;
};

export type PhysicalInvoiceField = keyof PhysicalInvoiceDraft;

export type PhysicalInvoiceRequest = PhysicalInvoiceDraft & {
  orderId: string;
  requestedAt: string;
};

export const EMPTY_PHYSICAL_INVOICE: PhysicalInvoiceDraft = {
  contactPerson: "",
  officeAddress: "",
  operatingHours: "",
};

export function trimPhysicalInvoice(draft: PhysicalInvoiceDraft): PhysicalInvoiceDraft {
  return {
    contactPerson: draft.contactPerson.trim(),
    officeAddress: draft.officeAddress.trim(),
    operatingHours: draft.operatingHours.trim(),
  };
}

export function physicalInvoiceFieldError(
  field: PhysicalInvoiceField,
  value: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    switch (field) {
      case "contactPerson":
        return "Name the person GRIDGO should ask for.";
      case "officeAddress":
        return "Enter the office address the printed invoice should go to.";
      case "operatingHours":
        return "Say when someone is there to take it.";
    }
  }
  const max =
    field === "officeAddress"
      ? PHYSICAL_INVOICE_ADDRESS_MAX
      : field === "contactPerson"
        ? PHYSICAL_INVOICE_CONTACT_MAX
        : PHYSICAL_INVOICE_HOURS_MAX;
  if (trimmed.length > max) {
    return `Keep this under ${max} characters.`;
  }
  return null;
}

/** The first thing still wrong, so the screen names one fix at a time. */
export function firstPhysicalInvoiceError(
  draft: PhysicalInvoiceDraft,
): { field: PhysicalInvoiceField; message: string } | null {
  for (const field of ["contactPerson", "officeAddress", "operatingHours"] as const) {
    const message = physicalInvoiceFieldError(field, draft[field]);
    if (message) return { field, message };
  }
  return null;
}

export function physicalInvoiceReady(draft: PhysicalInvoiceDraft): boolean {
  return firstPhysicalInvoiceError(draft) == null;
}
