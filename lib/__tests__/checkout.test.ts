import {
  fulfilmentModeFor,
  blockerLine,
  isTimingAvailable,
  placeOrderBlockers,
  TIMINGS,
  travelBlurb,
  travelCaveat,
  travelChoiceOf,
} from "@/lib/checkout";
import type { Cart, CartLineRecord } from "@/lib/api";

const READY = {
  lineCount: 1,
  linesMissingArtwork: 0,
  linesMissingDropoff: 0,
  scheduledFor: null,
  timing: "standard" as const,
  referenceOk: true,
  hasProof: true,
  hasSettings: true,
};

function cart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: { lat: 7.07, lng: 125.61, label: "Home" },
    lines: [],
    checkedOutOrderId: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

function line(overrides: Partial<CartLineRecord> = {}): CartLineRecord {
  return {
    id: "cline_1",
    supplierId: "user_shop",
    catalogItemId: "sci_flyers",
    quantity: 1,
    optionIds: [],
    measurement: null,
    structuredSpec: {},
    artworkFileId: "file_1",
    mockupFileId: null,
    dropoff: null,
    sortOrder: 0,
    listing: null,
    lineSubtotalMinor: 2500,
    ...overrides,
  };
}

describe("placeOrderBlockers", () => {
  it("clears the way when everything is answered", () => {
    expect(placeOrderBlockers(READY)).toEqual([]);
  });

  it("stops an empty basket", () => {
    expect(placeOrderBlockers({ ...READY, lineCount: 0 })).toContain("empty");
  });

  it("stops a job with no file on it", () => {
    // A shop cannot print what it has not been sent, and checkout would send
    // the order straight back.
    expect(placeOrderBlockers({ ...READY, linesMissingArtwork: 1 })).toContain("artwork");
  });

  it("stops a delivery with an item that has nowhere to go", () => {
    expect(placeOrderBlockers({ ...READY, linesMissingDropoff: 1 })).toContain("address");
  });

  it("stops a basket holding a line GRIDGO could not price", () => {
    // A quantity under the shop's minimum has no price, and checkout would
    // refuse it with `below_minimum_quantity`; the client is told first.
    expect(placeOrderBlockers({ ...READY, linesUnpriced: 1 })).toContain("price");
    expect(placeOrderBlockers({ ...READY, linesUnpriced: 0 })).toEqual([]);
  });

  it("does not block on a missing checkout timing picker", () => {
    // When the job is wanted was asked on the when screen. Checkout no longer
    // carries Standard / Scheduled / Express, so a missing date here cannot
    // stand between the basket and Place order.
    expect(placeOrderBlockers({ ...READY, timing: "scheduled" })).toEqual([]);
    expect(
      placeOrderBlockers({
        ...READY,
        timing: "scheduled",
        scheduledFor: null,
      }),
    ).toEqual([]);
  });

  it("will not place an order without the receipt and its reference", () => {
    // Checkout refuses both, so the sheet asks before the button does.
    expect(placeOrderBlockers({ ...READY, hasProof: false })).toContain("proof");
    expect(placeOrderBlockers({ ...READY, referenceOk: false })).toContain("reference");
  });

  it("holds the order when GRIDGO's own charges are unread", () => {
    expect(placeOrderBlockers({ ...READY, hasSettings: false })).toContain("settings");
  });

  it("puts the blockers in the order the client should fix them", () => {
    expect(
      placeOrderBlockers({
        ...READY,
        lineCount: 0,
        linesMissingArtwork: 1,
        linesMissingDropoff: 1,
        hasProof: false,
        referenceOk: false,
      }),
    ).toEqual(["empty", "artwork", "address", "proof", "reference"]);
  });
});

describe("blockerLine", () => {
  it("names the one item waiting for a file when there is only one", () => {
    expect(blockerLine("artwork", "Flyers")).toContain("Flyers");
    expect(blockerLine("artwork")).toContain("every item");
  });

  it("tells the client to change the quantity on the item with no price", () => {
    expect(blockerLine("price", "Lanyard/Sling Print")).toBe(
      "Lanyard/Sling Print has no price at this quantity. Open it and change the quantity.",
    );
    expect(blockerLine("price")).toBe(
      "One item has no price at this quantity. Open it and change the quantity.",
    );
  });

  it("says what to do, never what went wrong internally", () => {
    for (const blocker of [
      "empty",
      "artwork",
      "address",
      "schedule",
      "proof",
      "reference",
      "settings",
      "price",
    ] as const) {
      const text = blockerLine(blocker);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/null|undefined|error|400|409|cart_/i);
    }
  });
});

describe("timing", () => {
  it("lists express and refuses it, rather than hiding it", () => {
    // A client who cannot find express assumes the app is broken; one who reads
    // "not open in Davao yet" knows where they stand.
    expect(TIMINGS).toContain("express");
    expect(isTimingAvailable("express")).toBe(false);
    expect(isTimingAvailable("standard")).toBe(true);
    expect(isTimingAvailable("scheduled")).toBe(true);
  });
});

describe("how it travels", () => {
  it("sends multi-drop to the platform as the delivery it is", () => {
    // GRIDGO has two fulfilment modes. Multi-drop is a delivery whose lines
    // carry their own addresses, not a third mode.
    expect(fulfilmentModeFor("delivery")).toBe("delivery");
    expect(fulfilmentModeFor("multi_drop")).toBe("delivery");
    expect(fulfilmentModeFor("pickup")).toBe("pickup");
  });

  it("reads the choice back from the basket rather than from memory", () => {
    expect(travelChoiceOf(null)).toBe("delivery");
    expect(travelChoiceOf(cart({ fulfillmentMode: "pickup" }))).toBe("pickup");
    expect(travelChoiceOf(cart({ lines: [line()] }))).toBe("delivery");
    expect(
      travelChoiceOf(
        cart({ lines: [line({ dropoff: { lat: 7.1, lng: 125.6, label: "Office" } })] }),
      ),
    ).toBe("multi_drop");
  });

  it("says plainly what Operations still has to settle", () => {
    expect(travelCaveat("delivery")).toBeNull();
    expect(travelCaveat("multi_drop")).toContain("farthest drop");
  });

  it("collects at GRIDGO's office, never at whoever printed it", () => {
    // A client who reads "collect from the shop counter" goes to the wrong
    // place: a rider brings the finished job to GRIDGO and they collect there.
    expect(travelBlurb("pickup")).toBe("You collect at GRIDGO Office. No delivery charge.");
    expect(travelCaveat("pickup")).toContain("brings your finished job to the office");
    expect(travelBlurb("pickup")).not.toMatch(/shop/i);
    expect(travelCaveat("pickup")).not.toMatch(/shop/i);
  });
});
