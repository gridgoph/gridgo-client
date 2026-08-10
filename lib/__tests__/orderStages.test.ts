import { ORDER_STAGES, orderStageIndex } from "@/lib/orderStages";

describe("ORDER_STAGES", () => {
  it("is the legacy GRIDGO four, in order", () => {
    expect(ORDER_STAGES.map((stage) => stage.label)).toEqual([
      "Order",
      "Printing",
      "Dispatch",
      "Delivered",
    ]);
  });
});

describe("orderStageIndex", () => {
  it("keeps everything before production at Order — nothing is made yet", () => {
    for (const state of [
      "draft",
      "submitted",
      "needs_qa",
      "client_correction",
      "proof_approval",
      "approved_for_matching",
      "supplier_assigned",
      "awaiting_downpayment",
      "downpayment_review",
      "payment_authorized",
    ]) {
      expect(orderStageIndex(state)).toBe(0);
    }
  });

  it("advances only when the job actually moves", () => {
    expect(orderStageIndex("production")).toBe(1);
    expect(orderStageIndex("supplier_self_qc")).toBe(1);
    expect(orderStageIndex("ready_for_dispatch")).toBe(2);
    expect(orderStageIndex("out_for_delivery")).toBe(2);
    expect(orderStageIndex("delivered")).toBe(3);
    expect(orderStageIndex("issue_window_open")).toBe(3);
    expect(orderStageIndex("completed")).toBe(3);
  });

  it("never guesses a position for a state it does not know", () => {
    // A rail drawn at an invented stage is worse than no rail.
    expect(orderStageIndex("supplier_proof_review")).toBeNull();
    expect(orderStageIndex("something_new")).toBeNull();
    expect(orderStageIndex(undefined)).toBeNull();
    expect(orderStageIndex(null)).toBeNull();
  });
});
