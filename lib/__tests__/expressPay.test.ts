import { expressPayBlocker, noExpressShopLine, payableMinor } from "@/lib/express";

// 9BA29059: an Express order with no shop opened a ₱0.00 pay sheet.

describe("payableMinor", () => {
  it("is the up-front amount only when it is a real, positive figure", () => {
    expect(payableMinor({ downpaymentMinor: 12_300 })).toBe(12_300);
    expect(payableMinor({ downpaymentMinor: 0 })).toBeNull();
    expect(payableMinor({ downpaymentMinor: -5 })).toBeNull();
    expect(payableMinor({ downpaymentMinor: null })).toBeNull();
    expect(payableMinor(null)).toBeNull();
  });
});

describe("expressPayBlocker", () => {
  const ready = {
    place: true,
    fulfilment: "pickup" as const,
    withPrinter: false,
    shopCount: 2,
    shopChosen: true,
    draft: "ready" as const,
    amountMinor: 12_300,
  };

  it("lets payment open once there is a place, a shop, a draft and an amount", () => {
    expect(expressPayBlocker(ready)).toBeNull();
  });

  it("stops on no open shop with the next step for pick-up and for delivery", () => {
    expect(expressPayBlocker({ ...ready, shopCount: 0, shopChosen: false, draft: "idle", amountMinor: null })).toEqual({
      kind: "no_shop",
      line: "No Express shop is open near you right now. Choose Deliver, or try again later.",
    });
    expect(noExpressShopLine("delivery")).toBe(
      "No Express shop can deliver here right now. Choose another place, or try again later.",
    );
  });

  it("waits for a place, the shop list, a shop and the price", () => {
    expect(expressPayBlocker({ ...ready, place: false })?.kind).toBe("wait");
    expect(expressPayBlocker({ ...ready, shopCount: null, shopChosen: false })?.line).toBe("Finding shops…");
    expect(expressPayBlocker({ ...ready, shopChosen: false })?.line).toBe("Choose a shop first.");
    expect(expressPayBlocker({ ...ready, withPrinter: true, shopCount: null, shopChosen: false })?.line).toBe("Choose who prints it first.");
    expect(expressPayBlocker({ ...ready, draft: "loading" })?.line).toBe("Waiting for the price.");
  });

  it("carries the draft's own error", () => {
    expect(expressPayBlocker({ ...ready, draft: "error", draftMessage: "That shop just closed." })).toEqual({
      kind: "error",
      line: "That shop just closed.",
    });
  });

  it("never opens payment on a ready draft with no amount, unless nothing is paid now", () => {
    expect(expressPayBlocker({ ...ready, amountMinor: null })?.kind).toBe("stop");
    expect(expressPayBlocker({ ...ready, amountMinor: null, asksPayment: false })).toBeNull();
  });
});
