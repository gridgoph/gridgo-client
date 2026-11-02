import { ApiError } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  batchPriceAt,
  canCancelBatch,
  canDecideSample,
  canResample,
  defaultBatchPricing,
  heldPriceNote,
  holdLine,
  lineQuantityFixed,
  orderSampleAction,
  orderSampleLine,
  orderSampleLink,
  sampleLineCaption,
  batchSize,
  batchStepperUnit,
  sampleOffer,
  sampleStage,
  sampleStatusView,
} from "@/lib/sampleFirst";
import { approvedBatch, expiredBatch, sampleBatch } from "@/test/sampleBatch";

const DAY = 24 * 60 * 60 * 1000;

describe("sampleOffer", () => {
  it("offers a sample only when the shop turned it on and priced it", () => {
    expect(sampleOffer({ sampleAvailable: true, samplePriceMinor: 5000, clientSamplePriceMinor: 5150 })).toEqual({
      clientMinor: 5150,
      supplierMinor: 5000,
    });
    expect(sampleOffer({ sampleAvailable: false, samplePriceMinor: 5000, clientSamplePriceMinor: 5150 })).toBeNull();
    expect(sampleOffer({ sampleAvailable: true, samplePriceMinor: null, clientSamplePriceMinor: null })).toBeNull();
    // An older API without the fields offers nothing.
    expect(sampleOffer({})).toBeNull();
    expect(sampleOffer(null)).toBeNull();
  });
});

describe("where a sample stands", () => {
  it("waits while the sample is made, then asks for a decision once it arrives", () => {
    expect(sampleStage(sampleBatch())).toBe("making");
    expect(canDecideSample(sampleBatch())).toBe(false);
    for (const state of ["delivered", "issue_window_open", "completed", "payout_released"]) {
      const arrived = sampleBatch({ sampleOrderState: state });
      expect(sampleStage(arrived)).toBe("decide");
      expect(canDecideSample(arrived)).toBe(true);
    }
    expect(sampleStatusView(sampleBatch({ sampleOrderState: "delivered" })).label).toBe("Check your sample");
  });

  it("offers a new sample only after a resample rejection that is not yet replaced", () => {
    const rejection = { version: 1, reason: "Too dark", next: "resample" as const, at: "2026-11-02T00:00:00.000Z" };
    expect(canResample(sampleBatch({ status: "rejected", rejection }))).toBe(true);
    expect(canResample(sampleBatch({ status: "rejected", rejection, replacedByDraftId: "sbd_2" }))).toBe(false);
    expect(canResample(sampleBatch({ status: "rejected", rejection: { ...rejection, next: "cancel" } }))).toBe(false);
  });

  it("lets a batch be cancelled until it is ordered", () => {
    expect(canCancelBatch(sampleBatch())).toBe(true);
    expect(canCancelBatch(approvedBatch())).toBe(true);
    expect(canCancelBatch(approvedBatch({ status: "ordered" }))).toBe(false);
    expect(canCancelBatch(sampleBatch({ status: "cancelled" }))).toBe(false);
  });
});

describe("the price hold", () => {
  it("says the clock starts at delivery before the sample has arrived", () => {
    expect(holdLine(sampleBatch())).toBe("The batch price is held for 14 days after the sample arrives.");
    expect(holdLine(sampleBatch({ holdDays: 1 }))).toBe("The batch price is held for 1 day after the sample arrives.");
  });

  it("counts down while the hold is live", () => {
    const now = Date.parse("2026-11-02T04:00:00.000Z");
    const batch = approvedBatch({ heldUntil: new Date(now + 10 * DAY + 3600_000).toISOString(), holdActive: true });
    expect(holdLine(batch, now)).toMatch(/^Held price until .+ · 10 days left\.$/);
    const last = approvedBatch({ heldUntil: new Date(now + 5 * 3600_000).toISOString(), holdActive: true });
    expect(holdLine(last, now)).toMatch(/less than a day left\.$/);
  });

  it("says the hold ended once it expires", () => {
    const batch = expiredBatch();
    expect(holdLine(batch)).toMatch(/^Held price ended /);
    // Expiry is the server's call, but a clock past heldUntil never reads as live.
    const stale = approvedBatch({ heldUntil: new Date(Date.now() - 1000).toISOString(), holdActive: true });
    expect(holdLine(stale)).toMatch(/^Held price ended /);
  });

  it("has nothing to hold once ordered, rejected or cancelled", () => {
    expect(holdLine(approvedBatch({ status: "ordered" }))).toBeNull();
    expect(holdLine(sampleBatch({ status: "cancelled" }))).toBeNull();
  });

  it("orders at the held price while it lasts, else today's price", () => {
    expect(defaultBatchPricing(approvedBatch())).toBe("held");
    expect(defaultBatchPricing(expiredBatch())).toBe("current");
    expect(defaultBatchPricing(sampleBatch())).toBeNull();
  });

  it("explains in plain words why the held price is out of reach", () => {
    expect(heldPriceNote(approvedBatch())).toBeNull();
    expect(heldPriceNote(expiredBatch())).toMatch(/^The held price ended .+\. Today's price applies\.$/);
    expect(heldPriceNote(approvedBatch({ canOrderAtHeldPrice: false, heldPriceBlocker: "sample_shop_changed" }))).toBe(
      "Another shop made your sample, so its batch price was not held. Today's price applies.",
    );
  });

  it("reads a price only for the quantity it was worked out for", () => {
    const batch = approvedBatch({
      heldPrice: { quantity: 1000, clientItemMinor: 400000 },
      currentPrice: null,
    });
    expect(batchPriceAt(batch, "held", 1000)).toBe(400000);
    // Another quantity is still being priced, so no figure yet.
    expect(batchPriceAt(batch, "held", 500)).toBeUndefined();
    // GRIDGO could not price it: never zero.
    expect(batchPriceAt(batch, "current", 1000)).toBeNull();
  });
});

describe("basket lines", () => {
  it("says a sample is one piece standing for the batch", () => {
    const line = { sample: { batchQuantity: 500, replacesSampleBatchId: null }, sampleBatch: null };
    expect(sampleLineCaption(line)).toBe("Sample · 1 piece. Your batch of 500 is saved until you approve it.");
    // With the listing to hand, the batch is said in its own unit.
    expect(sampleLineCaption({ ...line, listing: { pricingUnit: "per_package", packageQty: 100 } as never })).toBe(
      "Sample · 1 piece. Your batch of 500 packs (50,000 pieces) is saved until you approve it.",
    );
    expect(batchSize({ pricingUnit: "per_piece", packageQty: null } as never, 1)).toBe("1 piece");
    // The batch stepper counts in the listing's unit, or plain items when unsure.
    expect(batchStepperUnit({ pricingUnit: "per_package", packageQty: 100 })).toBe("pack100");
    expect(batchStepperUnit({ pricingUnit: "per_package", packageQty: 50 })).toBe("");
    expect(batchStepperUnit({ pricingUnit: "per_unit", packageQty: null })).toBe("piece");
    expect(batchStepperUnit(null)).toBe("");
    expect(lineQuantityFixed(line)).toBe(true);
  });

  it("says a batch keeps its sample's specs, at which price", () => {
    const held = {
      sample: null,
      sampleBatch: { draftId: "sbd_1", pricing: "held" as const, sampleOrderId: "ord_sample", heldUntil: "2026-11-16T04:00:00.000Z" },
    };
    expect(sampleLineCaption(held)).toMatch(/^Batch from your approved sample, at the held price until .+\. Only the quantity can change\.$/);
    expect(lineQuantityFixed(held)).toBe(false);
    expect(sampleLineCaption({ ...held, sampleBatch: { ...held.sampleBatch, pricing: "current" } })).toBe(
      "Batch from your approved sample, at today's price. Only the quantity can change.",
    );
    expect(sampleLineCaption({ sample: null, sampleBatch: null })).toBeNull();
  });

  it("explains locked specs and an ended hold when GRIDGO refuses them", () => {
    expect(userFacingError(new ApiError(409, { error: "sample_batch_specs_locked", fields: ["optionIds"] }), "x")).toMatch(
      /keeps the specs of the sample you approved/,
    );
    expect(userFacingError(new ApiError(409, { error: "sample_hold_expired" }), "x")).toBe(
      "The held price has ended. You can still order this batch at today's price.",
    );
    expect(userFacingError(new ApiError(409, { error: "sample_cart_exclusive" }), "x")).toMatch(/checked out on its own/);
  });
});

describe("orders", () => {
  it("tags a sample and links it to its batch once ordered", () => {
    const sample = orderSampleLink({ orderTags: ["sample"], sampleBatchDraftId: "sbd_1", batchOrderId: null });
    expect(sample).toEqual({ kind: "sample", tag: "Sample", linkedOrderId: null, linkLabel: null, draftId: "sbd_1" });
    const ordered = orderSampleLink({ orderTags: ["sample"], sampleBatchDraftId: "sbd_1", batchOrderId: "ord_batch" });
    expect(ordered?.linkedOrderId).toBe("ord_batch");
    expect(ordered?.linkLabel).toBe("Open the batch order");
  });

  it("tags a batch and links it back to its sample", () => {
    const batch = orderSampleLink({ orderTags: ["batch_from_sample"], sampleOrderId: "ord_sample", sampleBatchDraftId: "sbd_1" });
    expect(batch).toMatchObject({ kind: "batch", tag: "Batch from sample", linkedOrderId: "ord_sample", linkLabel: "Open the sample order" });
    expect(orderSampleLink({ orderTags: [] })).toBeNull();
    expect(orderSampleLink({})).toBeNull();
  });

  it("words the way to the sample page for where the sample stands", () => {
    const link = orderSampleLink({ orderTags: ["sample"], sampleBatchDraftId: "sbd_1" })!;
    expect(orderSampleAction(link, { state: "in_production" })).toBe("Open the sample record");
    expect(orderSampleAction(link, { state: "issue_window_open" })).toBe("Check your sample");
    const approved = { state: "completed", sampleDecision: { draftId: "sbd_1", decision: "approved", at: "2026-11-02T00:00:00.000Z" } };
    expect(orderSampleAction(link, approved)).toBe("Order the batch");
    expect(orderSampleLine(link, approved)).toBe("You approved this sample. Order the batch while its price is held.");
  });
});
