import {
  ORDER_STEP_IDS,
  orderStepAccessibilityLabel,
  orderStepLabel,
  orderSteps,
} from "@/lib/orderSteps";

describe("order steps", () => {
  it("runs shop, listing, artwork, pay", () => {
    expect(ORDER_STEP_IDS).toEqual(["shop", "listing", "artwork", "pay"]);
  });

  it("puts everything before the client behind them and everything after ahead", () => {
    expect(orderSteps("artwork").map((step) => step.state)).toEqual([
      "done",
      "done",
      "current",
      "todo",
    ]);
  });

  it("marks the first step current at the start and the last at the end", () => {
    expect(orderSteps("shop").map((step) => step.state)).toEqual([
      "current",
      "todo",
      "todo",
      "todo",
    ]);
    expect(orderSteps("pay").map((step) => step.state)).toEqual([
      "done",
      "done",
      "done",
      "current",
    ]);
  });

  it("names each step", () => {
    // The first step is GRIDGO answering with a pick, not a shopfront.
    expect(orderStepLabel("shop")).toBe("Match");
    expect(orderStepLabel("pay")).toBe("Pay");
  });

  it("says the position out loud, because the bar's own order is only visual", () => {
    const [shop, listing, artwork] = orderSteps("listing");
    expect(orderStepAccessibilityLabel(shop, 1)).toBe(
      "Step 1 of 4: Match, done. Go back to it.",
    );
    expect(orderStepAccessibilityLabel(listing, 2)).toBe(
      "Step 2 of 4: Listing, where you are now.",
    );
    expect(orderStepAccessibilityLabel(artwork, 3)).toBe(
      "Step 3 of 4: Artwork, not reached yet.",
    );
  });
});
