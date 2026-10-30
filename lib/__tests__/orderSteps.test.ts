import {
  matchPrepAccessibilityLabel,
  ORDER_STEP_IDS,
  orderStepAccessibilityLabel,
  orderStepCaption,
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
    // In the client's words: never our "Listing", never a bare "Pay".
    expect(orderStepLabel("listing")).toBe("Print details");
    expect(orderStepLabel("pay")).toBe("Review & pay");
  });

  it("says what the current step asks, without a number", () => {
    expect(orderStepCaption("listing")).toBe(
      "Choose options and quantity, then add it to your order.",
    );
    expect(orderStepCaption("pay")).toBe("Check your order, then pay by QR to place it.");
    for (const id of ORDER_STEP_IDS) expect(orderStepCaption(id)).not.toMatch(/\d/);
  });

  it("promises a way back only where the screen offers one", () => {
    const [shop] = orderSteps("pay");
    expect(orderStepAccessibilityLabel(shop, 1, false)).toBe("Step 1 of 4: Match, done.");
  });

  it("explains that the questions before the match prepare it", () => {
    expect(matchPrepAccessibilityLabel("delivery")).toBe(
      "Before we match: your date, delivery and priorities prepare the match. Now: delivery.",
    );
  });

  it("says the position out loud, because the bar's own order is only visual", () => {
    const [shop, listing, artwork] = orderSteps("listing");
    expect(orderStepAccessibilityLabel(shop, 1)).toBe(
      "Step 1 of 4: Match, done. Go back to it.",
    );
    expect(orderStepAccessibilityLabel(listing, 2)).toBe(
      "Step 2 of 4: Print details, where you are now.",
    );
    expect(orderStepAccessibilityLabel(artwork, 3)).toBe(
      "Step 3 of 4: Artwork, not reached yet.",
    );
  });
});
