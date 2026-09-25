/**
 * Features held back for the pilot. Each one is a single switch here, so it
 * comes back with a one-line change and its code stays in place.
 */

/**
 * Asking GRIDGO for a printed invoice (`app/order/physical-invoice.tsx`).
 *
 * Off for the pilot — the captain's call on gridgoph/gridgo-web#61
 * (2026-09-25). It returns after the pilot, because BIR makes a printed
 * invoice mandatory. While off, no screen offers the request; an order that
 * already has one can still show it (`physicalInvoiceEntry` in
 * `lib/physicalInvoice.ts`).
 */
export const PHYSICAL_INVOICE_REQUESTS_ENABLED = false;
