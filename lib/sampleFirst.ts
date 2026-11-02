import type { StatusIconName, StatusTone } from "@/components/StatusChip";
import type { CartLineRecord, CatalogItem, Order, SampleBatch, SampleBatchPricing } from "@/lib/api";
import { readyByDate } from "@/lib/readyTime";

/**
 * Sample First (gridgo-api#222, `docs/SAMPLE_FIRST_API.md`).
 *
 * A client can pay for one sample piece before the batch. The sample is an
 * ordinary order of its own; the batch waits as a draft at a held price list
 * until the client approves the sample, then becomes an ordinary order too.
 * These are the rules a screen reads, so no screen decides them itself.
 */

export const SAMPLES_ROUTE = "/samples";

export function sampleBatchHref(id: string): string {
  return `/samples/${encodeURIComponent(id)}`;
}

/** The order states in which the sample has reached the client (the API's own list). */
const SAMPLE_DELIVERED_STATES = new Set(["delivered", "issue_window_open", "completed", "payout_released"]);

export function sampleDelivered(state: string | null | undefined): boolean {
  return state != null && SAMPLE_DELIVERED_STATES.has(state);
}

/* -------------------------------------------------------------------------- */
/* The offer on a listing                                                      */
/* -------------------------------------------------------------------------- */

export type SampleOffer = {
  /** GRIDGO's price for one sample piece, fee inside. */
  clientMinor: number | null;
  /** The shop's own figure, only for `GridgoPrice`'s older-payload fallback. */
  supplierMinor: number | null;
};

/** The sample a listing offers now, or null. */
export function sampleOffer(
  listing: Pick<CatalogItem, "sampleAvailable" | "samplePriceMinor" | "clientSamplePriceMinor"> | null | undefined,
): SampleOffer | null {
  if (!listing?.sampleAvailable) return null;
  const clientMinor = listing.clientSamplePriceMinor ?? null;
  const supplierMinor = listing.samplePriceMinor ?? null;
  if (clientMinor == null && supplierMinor == null) return null;
  return { clientMinor, supplierMinor };
}

/** Under the sample buttons, below the batch it saves: what is paid now and what is kept. */
export const SAMPLE_OFFER_NOTE =
  "You pay for one sample piece now, plus delivery. The batch above is saved at this shop's prices until you decide.";

/**
 * A batch's size in the listing's own unit — "5 packs (500 pieces)" or
 * "500 pieces" — or the bare count when the listing is not to hand.
 */
export function batchSize(
  listing: Pick<CatalogItem, "pricingUnit" | "packageQty"> | null | undefined,
  quantity: number,
): string {
  const count = quantity.toLocaleString("en-PH");
  if (!listing) return count;
  if (listing.pricingUnit !== "per_package" || !listing.packageQty) return quantity === 1 ? "1 piece" : `${count} pieces`;
  const packs = quantity === 1 ? "1 pack" : `${count} packs`;
  return `${packs} (${(quantity * listing.packageQty).toLocaleString("en-PH")} pieces)`;
}

/** The quantity stepper's unit for a batch of this listing; "" counts plain items. */
export function batchStepperUnit(listing: Pick<CatalogItem, "pricingUnit" | "packageQty"> | null | undefined): string {
  if (listing?.pricingUnit === "per_package") return listing.packageQty === 100 ? "pack100" : "";
  return listing?.pricingUnit === "per_unit" ? "piece" : "";
}

/* -------------------------------------------------------------------------- */
/* A basket line                                                               */
/* -------------------------------------------------------------------------- */

/** The caption a sample or batch line carries in checkout; null for an ordinary line. */
export function sampleLineCaption(
  line: Pick<CartLineRecord, "sample" | "sampleBatch"> & { listing?: CartLineRecord["listing"] },
): string | null {
  if (line.sample) {
    return `Sample · 1 piece. Your batch of ${batchSize(line.listing, line.sample.batchQuantity)} is saved until you approve it.`;
  }
  if (line.sampleBatch) {
    const until = readyByDate(line.sampleBatch.heldUntil);
    const price =
      line.sampleBatch.pricing === "held"
        ? `the held price${until ? ` until ${until}` : ""}`
        : "today's price";
    return `Batch from your approved sample, at ${price}. Only the quantity can change.`;
  }
  return null;
}

/** A basket holding a sample, or a batch from one: GRIDGO takes nothing else in it. */
export function isSampleBasket(lines: Pick<CartLineRecord, "sample" | "sampleBatch">[]): boolean {
  return lines.some((line) => Boolean(line.sample || line.sampleBatch));
}

export const SAMPLE_BASKET_NOTE = "A sample, or a batch from one, is ordered on its own.";

/** A batch from a sample keeps the sample's specs and artwork: only its quantity changes. */
export function lineSpecsLocked(line: Pick<CartLineRecord, "sampleBatch">): boolean {
  return Boolean(line.sampleBatch);
}

/** A sample line is one piece: its quantity is not the client's to step. */
export function lineQuantityFixed(line: Pick<CartLineRecord, "sample">): boolean {
  return Boolean(line.sample);
}

/* -------------------------------------------------------------------------- */
/* A batch draft                                                               */
/* -------------------------------------------------------------------------- */

export type SampleStage = "making" | "decide" | "approved" | "ordered" | "rejected" | "cancelled";

export function sampleStage(batch: Pick<SampleBatch, "status" | "sampleOrderState">): SampleStage {
  switch (batch.status) {
    case "approved":
      return "approved";
    case "ordered":
      return "ordered";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    default:
      return sampleDelivered(batch.sampleOrderState) ? "decide" : "making";
  }
}

/** Approve or reject: only while the draft waits and the sample has arrived. */
export function canDecideSample(batch: Pick<SampleBatch, "status" | "sampleOrderState">): boolean {
  return sampleStage(batch) === "decide";
}

/** Order another sample: a rejection that asked for one, not yet replaced. */
export function canResample(batch: Pick<SampleBatch, "status" | "rejection" | "replacedByDraftId">): boolean {
  return batch.status === "rejected" && batch.rejection?.next === "resample" && !batch.replacedByDraftId;
}

/** Cancel the draft: the API allows it until the batch is ordered. */
export function canCancelBatch(batch: Pick<SampleBatch, "status" | "replacedByDraftId">): boolean {
  if (batch.status === "rejected") return !batch.replacedByDraftId;
  return batch.status === "awaiting_sample" || batch.status === "approved";
}

export type SampleStatusView = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  line: string;
};

export function sampleStatusView(
  batch: Pick<
    SampleBatch,
    "status" | "sampleOrderState" | "holdActive" | "heldUntil" | "replacedByDraftId" | "rejection" | "canOrderAtHeldPrice"
  >,
): SampleStatusView {
  switch (sampleStage(batch)) {
    case "making":
      return {
        label: "Sample on its way",
        tone: "info",
        icon: "clock",
        line: "Your sample is being made and delivered like any order. Your batch is saved until you decide.",
      };
    case "decide":
      return {
        label: "Check your sample",
        tone: "warning",
        icon: "square-pen",
        line: "Your sample has arrived. Approve it to order the batch, or say what is wrong.",
      };
    case "approved":
      return {
        label: "Approved",
        tone: "success",
        icon: "circle-check",
        line: batch.canOrderAtHeldPrice
          ? "Order the batch while its price is held."
          : "The held price no longer applies. You can still order the batch at today's price.",
      };
    case "ordered":
      return {
        label: "Batch ordered",
        tone: "success",
        icon: "circle-check",
        line: "Your batch is an order now. Open it from here or from Orders.",
      };
    case "rejected":
      return {
        label: "Rejected",
        tone: "neutral",
        icon: "circle-x",
        line: batch.replacedByDraftId
          ? "You ordered a new sample for this batch."
          : "Order a new sample with the changes you need, or cancel the batch.",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        tone: "neutral",
        icon: "circle-x",
        line: "This batch will not be ordered.",
      };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where the held price stands, in one line: waiting on delivery, counting
 * down, or ended. Null once there is nothing left to hold.
 */
export function holdLine(
  batch: Pick<SampleBatch, "status" | "holdDays" | "heldUntil" | "holdActive">,
  now: number = Date.now(),
): string | null {
  if (batch.status !== "awaiting_sample" && batch.status !== "approved") return null;
  const until = readyByDate(batch.heldUntil);
  if (!batch.heldUntil || !until) {
    const days = batch.holdDays === 1 ? "1 day" : `${batch.holdDays} days`;
    return `The batch price is held for ${days} after the sample arrives.`;
  }
  const left = Date.parse(batch.heldUntil) - now;
  if (!batch.holdActive || !(left > 0)) return `Held price ended ${until}.`;
  const days = Math.floor(left / DAY_MS);
  const remaining = days < 1 ? "less than a day left" : days === 1 ? "1 day left" : `${days} days left`;
  return `Held price until ${until} · ${remaining}.`;
}

/** Which price the batch button uses when the screen opens; null when neither can. */
export function defaultBatchPricing(
  batch: Pick<SampleBatch, "canOrderAtHeldPrice" | "canOrderAtCurrentPrice">,
): SampleBatchPricing | null {
  if (batch.canOrderAtHeldPrice) return "held";
  if (batch.canOrderAtCurrentPrice) return "current";
  return null;
}

/** Why the held price is out of reach on an approved draft, in plain words. */
export function heldPriceNote(
  batch: Pick<SampleBatch, "status" | "canOrderAtHeldPrice" | "heldPriceBlocker" | "heldUntil">,
): string | null {
  if (batch.status !== "approved" || batch.canOrderAtHeldPrice) return null;
  switch (batch.heldPriceBlocker) {
    case "sample_hold_expired": {
      const until = readyByDate(batch.heldUntil);
      return `The held price ended${until ? ` ${until}` : ""}. Today's price applies.`;
    }
    case "sample_shop_changed":
      return "Another shop made your sample, so its batch price was not held. Today's price applies.";
    default:
      return null;
  }
}

/**
 * The batch price for one pricing at the quantity on screen. `undefined`
 * while GRIDGO has not priced that quantity yet; null when it cannot (under
 * the minimum, or the listing is gone) — never drawn as zero.
 */
export function batchPriceAt(
  batch: Pick<SampleBatch, "heldPrice" | "currentPrice">,
  pricing: SampleBatchPricing,
  quantity: number,
): number | null | undefined {
  const price = pricing === "held" ? batch.heldPrice : batch.currentPrice;
  if (!price) return null;
  return price.quantity === quantity ? price.clientItemMinor : undefined;
}

export function batchOrderLabel(pricing: SampleBatchPricing): string {
  return pricing === "held" ? "Order the batch at the held price" : "Order the batch at today's price";
}

/** A batch row's one-line summary: what it is and how many. */
export function sampleBatchSummary(batch: Pick<SampleBatch, "itemName" | "batch">): string {
  return `${batch.itemName ?? "Your product"} · batch of ${batch.batch.quantity.toLocaleString("en-PH")}`;
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                      */
/* -------------------------------------------------------------------------- */

export type OrderSampleLink = {
  kind: "sample" | "batch";
  /** The badge: "Sample" or "Batch from sample". */
  tag: string;
  /** The other order, when it exists. */
  linkedOrderId: string | null;
  linkLabel: string | null;
  /** The sample's page (decide, order the batch), when GRIDGO named the draft. */
  draftId: string | null;
};

/** The order's Sample First badge and the link to its other half; null on an ordinary order. */
export function orderSampleLink(
  order: Pick<Order, "orderTags" | "sampleOrderId" | "batchOrderId" | "sampleBatchDraftId">,
): OrderSampleLink | null {
  const tags = order.orderTags ?? [];
  if (tags.includes("batch_from_sample")) {
    return {
      kind: "batch",
      tag: "Batch from sample",
      linkedOrderId: order.sampleOrderId ?? null,
      linkLabel: order.sampleOrderId ? "Open the sample order" : null,
      draftId: order.sampleBatchDraftId ?? null,
    };
  }
  if (tags.includes("sample")) {
    return {
      kind: "sample",
      tag: "Sample",
      linkedOrderId: order.batchOrderId ?? null,
      linkLabel: order.batchOrderId ? "Open the batch order" : null,
      draftId: order.sampleBatchDraftId ?? null,
    };
  }
  return null;
}

/** The card's line under the badge, from what GRIDGO has decided so far. */
export function orderSampleLine(
  link: OrderSampleLink,
  order: Pick<Order, "state" | "sampleDecision">,
): string {
  if (link.kind === "batch") {
    return "This batch is made to match the sample you approved. Your approval is its standard.";
  }
  if (link.linkedOrderId) return "You approved this sample and ordered the batch.";
  const decision = order.sampleDecision?.decision;
  if (decision === "approved") return "You approved this sample. Order the batch while its price is held.";
  if (decision === "rejected") return "You rejected this sample.";
  if (sampleDelivered(order.state)) return "Your sample has arrived. Approve it or say what is wrong.";
  return "One sample piece. Your batch is saved until you approve it.";
}

/** The way from a sample order to its own sample page, worded for where it stands. */
export function orderSampleAction(
  link: OrderSampleLink,
  order: Pick<Order, "state" | "sampleDecision">,
): string | null {
  if (link.kind !== "sample" || !link.draftId) return null;
  if (link.linkedOrderId) return "Open the sample record";
  const decision = order.sampleDecision?.decision;
  if (decision === "approved") return "Order the batch";
  if (decision === "rejected") return "Open the sample record";
  if (sampleDelivered(order.state)) return "Check your sample";
  return "Open the sample record";
}
