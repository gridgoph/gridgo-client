import type { Order, SampleBatch } from "@/lib/api";

/** A sampled batch as `GET /me/sample-batches/:id` returns it (gridgo-api#222). */
export function sampleBatch(overrides: Partial<SampleBatch> = {}): SampleBatch {
  return {
    id: "sbd_1",
    status: "awaiting_sample",
    tags: ["sample_batch"],
    catalogItemId: "item_flyer",
    itemName: "A5 Flyers",
    sampleOrderId: "ord_sample",
    sampleOrderState: "in_production",
    batchOrderId: null,
    previousDraftId: null,
    replacedByDraftId: null,
    batch: { quantity: 500, optionIds: ["opt_a5"], specialInstructions: "" },
    holdDays: 14,
    sampleDeliveredAt: null,
    heldUntil: null,
    holdActive: false,
    holdExpired: false,
    heldPrice: { quantity: 500, clientItemMinor: 250000 },
    currentPrice: { quantity: 500, clientItemMinor: 300000 },
    canOrderAtHeldPrice: false,
    heldPriceBlocker: "sample_batch_not_approved",
    canOrderAtCurrentPrice: false,
    approval: null,
    rejection: null,
    version: 1,
    createdAt: "2026-11-01T02:00:00.000Z",
    updatedAt: "2026-11-01T02:00:00.000Z",
    ...overrides,
  };
}

/** Delivered and approved, with the held price live for another ten days. */
export function approvedBatch(overrides: Partial<SampleBatch> = {}): SampleBatch {
  const delivered = Date.now() - 4 * 24 * 60 * 60 * 1000;
  return sampleBatch({
    status: "approved",
    sampleOrderState: "issue_window_open",
    sampleDeliveredAt: new Date(delivered).toISOString(),
    heldUntil: new Date(delivered + 14 * 24 * 60 * 60 * 1000).toISOString(),
    holdActive: true,
    canOrderAtHeldPrice: true,
    heldPriceBlocker: null,
    canOrderAtCurrentPrice: true,
    approval: {
      version: 1,
      method: "tick",
      accepted: true,
      samplePhotoFileId: "file_photo",
      at: new Date(delivered + 60 * 60 * 1000).toISOString(),
    },
    ...overrides,
  });
}

/** Approved, but the fourteen days ran out. */
export function expiredBatch(overrides: Partial<SampleBatch> = {}): SampleBatch {
  const delivered = Date.now() - 20 * 24 * 60 * 60 * 1000;
  return approvedBatch({
    sampleDeliveredAt: new Date(delivered).toISOString(),
    heldUntil: new Date(delivered + 14 * 24 * 60 * 60 * 1000).toISOString(),
    holdActive: false,
    holdExpired: true,
    canOrderAtHeldPrice: false,
    heldPriceBlocker: "sample_hold_expired",
    ...overrides,
  });
}

/** The Sample First fields an order carries; spread over an order fixture. */
export function sampleOrderFields(kind: "sample" | "batch", overrides: Partial<Order> = {}): Partial<Order> {
  return kind === "sample"
    ? { orderTags: ["sample"], sampleBatchDraftId: "sbd_1", batchOrderId: null, ...overrides }
    : { orderTags: ["batch_from_sample"], sampleBatchDraftId: "sbd_1", sampleOrderId: "ord_sample", ...overrides };
}
