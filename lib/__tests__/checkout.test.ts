import {
  FILE_CHECK_AFTER_PAYMENT,
  artworkRefusalOf,
  fulfilmentModeFor,
  lineArtworkStatus,
  invoiceNote,
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

describe("invoiceNote", () => {
  it("names the service fee only while Operations shows it", () => {
    expect(invoiceNote(true)).toMatch(/the service fee/);
    expect(invoiceNote(false)).not.toMatch(/fee|\d+(\.\d+)?\s*%/i);
    expect(invoiceNote(false)).toMatch(/printing, delivery, the total/);
  });
});

describe("artwork GRIDGO cannot use (gridgo-api#122)", () => {
  const LINK = { formatCode: "canva_link", url: "https://www.canva.com/design/DAF1/view" };
  const line = { id: "cline_1", artworkFileId: null, artworkLinks: [LINK] };

  it("stops the order while a link is still being checked, and when one fails", () => {
    expect(placeOrderBlockers({ ...READY, linesCheckingArtwork: 1 })).toEqual(["artwork_checking"]);
    expect(placeOrderBlockers({ ...READY, linesArtworkProblem: 1 })).toEqual(["artwork_problem"]);
    expect(blockerLine("artwork_problem", "Flyers")).toBe(
      "GRIDGO cannot use the artwork on Flyers. Open its Artwork to fix it.",
    );
  });

  it("reads checkout's refusal, in GRIDGO's own words, with the line it is about", () => {
    expect(
      artworkRefusalOf({
        error: "artwork_link_check_failed",
        lineId: "cline_1",
        field: "artwork",
        message: "Make the design viewable by anyone with the link.",
      }),
    ).toEqual({
      code: "artwork_link_check_failed",
      lineId: "cline_1",
      message: "Make the design viewable by anyone with the link.",
    });
  });

  it("words a refusal that came without a message, and ignores other answers", () => {
    expect(artworkRefusalOf({ error: "artwork_file_check_failed", lineId: "cline_1" })?.message).toMatch(
      /Export it again/,
    );
    expect(artworkRefusalOf({ error: "cart_empty" })).toBeNull();
    expect(artworkRefusalOf(null)).toBeNull();
  });

  it("says a line's link is being checked, then why it cannot be used", () => {
    const key = `${LINK.formatCode} ${LINK.url}`;
    expect(lineArtworkStatus(line, { [key]: { phase: "checking" } }, {})).toEqual({
      kind: "checking",
      text: "Checking the design link…",
    });
    const check = {
      ok: false, reachable: true, httpStatus: 200, provider: "canva" as const,
      access: "sign_in_required" as const, message: "Sign in",
    };
    expect(lineArtworkStatus(line, { [key]: { phase: "checked", check } }, {})).toEqual({
      kind: "problem",
      text: "This link is private. Open Artwork to fix it.",
    });
    expect(
      lineArtworkStatus(line, { [key]: { phase: "checked", check: { ...check, ok: true, access: "public_view" } } }, {}),
    ).toBeNull();
  });

  it("puts checkout's refusal ahead of a passing check, until the artwork changes", () => {
    const signature = `|${LINK.formatCode} ${LINK.url}`;
    const problems = { cline_1: { code: "artwork_link_check_failed", message: "Make it public.", signature } };
    expect(lineArtworkStatus(line, {}, problems)).toEqual({ kind: "problem", text: "Make it public." });
    expect(lineArtworkStatus({ ...line, artworkFileId: "file_2", artworkLinks: [] }, {}, problems)).toBeNull();
  });

  it("tells the client after payment that the file is checked before the shop starts", () => {
    expect(FILE_CHECK_AFTER_PAYMENT).toMatch(/quick check before the shop starts/);
  });
});
