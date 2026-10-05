import type { Cart, CartLineRecord, CartQuote, PlatformSettings } from "@/lib/api";
import {
  basketTotals,
  clientLineAmountMinor,
  deliveryFeeForDistance,
  printRuns,
  linesMissingArtwork,
  linesMissingDropoff,
  linesUnpriced,
  roundBps,
} from "@/lib/basket";

/** The API's own defaults, so the arithmetic here is the arithmetic there. */
const SETTINGS: PlatformSettings = {
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [
    { maxDistanceMeters: 4999, feeMinor: 2500 },
    { maxDistanceMeters: 10000, feeMinor: 5000 },
    { maxDistanceMeters: null, feeMinor: 7500 },
  ],
};

const NEARBY = { lat: 7.076, lng: 125.615, label: "Home" };

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
    lineSubtotalMinor: 100000,
    ...overrides,
  };
}

function cart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: NEARBY,
    lines: [line()],
    checkedOutOrderId: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("roundBps", () => {
  it("is the platform's formula, half up on the centavo", () => {
    expect(roundBps(100000, 1000)).toBe(10000);
    expect(roundBps(0, 1000)).toBe(0);
  });

  it("matches the rounding vector in the money contract", () => {
    // From docs/OPERATIONAL_MODEL_V2_API.md.
    expect(roundBps(99999, 1000)).toBe(10000);
    expect(roundBps(99999, 2500)).toBe(25000);
  });
});

describe("deliveryFeeForDistance", () => {
  it("takes the first band the distance fits in", () => {
    expect(deliveryFeeForDistance(SETTINGS, 0)).toBe(2500);
    expect(deliveryFeeForDistance(SETTINGS, 4999)).toBe(2500);
    expect(deliveryFeeForDistance(SETTINGS, 5000)).toBe(5000);
    expect(deliveryFeeForDistance(SETTINGS, 10000)).toBe(5000);
    expect(deliveryFeeForDistance(SETTINGS, 42000)).toBe(7500);
  });

  it("has nothing to charge when the bands do not reach", () => {
    expect(deliveryFeeForDistance({ deliveryFeeBands: [] }, 1000)).toBeNull();
  });
});

describe("printRuns", () => {
  it("keeps one press's lines together and adds them up", () => {
    const groups = printRuns(
      [
        line({ id: "a", lineSubtotalMinor: 4000 }),
        line({ id: "b", supplierId: "other", lineSubtotalMinor: 1000 }),
        line({ id: "c", lineSubtotalMinor: 500 }),
      ],
      1000,
    );

    // A run is named by where it sits in the basket, never by whose press it
    // is: the client is buying from GRIDGO.
    expect(groups.map((group) => group.runLabel)).toEqual(["Print run 1", "Print run 2"]);
    expect(JSON.stringify(groups)).not.toMatch(/Printshop|Lovis/i);
    expect(groups[0].lines.map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(groups[0].clientSubtotalMinor).toBe(4950);
    expect(groups[1].clientSubtotalMinor).toBe(1100);
  });
});

describe("clientLineAmountMinor", () => {
  it("prefers the API's GRIDGO field when it is a safe integer", () => {
    expect(
      clientLineAmountMinor({ lineSubtotalMinor: 4000, clientLineSubtotalMinor: 4400 }, 1000),
    ).toBe(4400);
  });

  it("marks a shop line up with the live rate", () => {
    expect(clientLineAmountMinor({ lineSubtotalMinor: 4000 }, 1000)).toBe(4400);
    expect(clientLineAmountMinor({ lineSubtotalMinor: 1_200 }, 4_500)).toBe(1_740);
  });

  it("leaves an unpriced line as not yet priced", () => {
    expect(clientLineAmountMinor({ lineSubtotalMinor: null }, 1000)).toBeNull();
  });

  it("never marks up a shop figure once GRIDGO has answered for the line, even with null", () => {
    expect(clientLineAmountMinor({ lineSubtotalMinor: 4000, clientLineSubtotalMinor: null }, 1000)).toBeNull();
  });

  it("has no subtotal at all while one of its lines has no price", () => {
    // GRIDGO answers `lineSubtotalMinor: null` for a line its pricer refused
    // (a quantity under the shop's minimum). Adding it up as zero is what put
    // "PHP 0.00" over a lanyard that costs PHP 50.00.
    const groups = printRuns([
      line({ id: "a", lineSubtotalMinor: 4000 }),
      line({ id: "b", lineSubtotalMinor: null }),
    ]);
    expect(groups[0].clientSubtotalMinor).toBeNull();
  });
});

/** GRIDGO's own figures for a basket, as `cart.clientQuote` carries them. */
function quote(overrides: Partial<CartQuote> = {}): CartQuote {
  return {
    status: "priced",
    reasons: [],
    clientItemSubtotalMinor: 110000,
    deliveryLines: [
      { lineIds: ["cline_1"], distanceZone: { key: "nearby", label: "Nearby" }, deliveryFeeMinor: 2500 },
    ],
    deliveryFeeMinor: 2500,
    totalMinor: 112500,
    downpaymentPercent: 100,
    downpaymentMinor: 112500,
    balanceMinor: 0,
    ...overrides,
  };
}

describe("basketTotals", () => {
  it("reads GRIDGO's quote as sent, adding nothing on the phone", () => {
    const totals = basketTotals({ cart: cart({ clientQuote: quote() }), settings: SETTINGS });
    expect(totals.clientItemSubtotalMinor).toBe(110000);
    expect(totals.deliveryFeeMinor).toBe(2500);
    expect(totals.totalMinor).toBe(112500);
    expect(totals.downpaymentMinor).toBe(112500);
    expect(totals.balanceMinor).toBe(0);
    expect(totals.downpaymentPercent).toBe(100);
    expect(totals.legs).toEqual([
      {
        runLabel: "Print run 1",
        lineIds: ["cline_1"],
        zone: { key: "nearby", label: "Nearby" },
        distanceKm: null,
        feeMinor: 2500,
      },
    ]);
  });

  it("names each delivery leg by the run it carries, with kilometres only Out of Zone", () => {
    const lines = [line({ id: "a" }), line({ id: "b", supplierId: "other" })];
    const totals = basketTotals({
      cart: cart({
        lines,
        clientQuote: quote({
          deliveryLines: [
            { lineIds: ["b"], distanceZone: { key: "out_of_zone", label: "Out of Zone" }, deliveryFeeMinor: 24500, distanceKm: 16.2 },
            { lineIds: ["a"], distanceZone: { key: "away", label: "Away" }, deliveryFeeMinor: 5000 },
          ],
        }),
      }),
      settings: SETTINGS,
    });
    expect(totals.legs.map((leg) => [leg.runLabel, leg.distanceKm])).toEqual([
      ["Print run 2", 16.2],
      ["Print run 1", null],
    ]);
    // The quote is about runs and zones, never a shop or its pin.
    expect(JSON.stringify(totals)).not.toMatch(/lat|lng|shopName/);
  });

  it("keeps a pick-up's hub fee inside delivery, never added twice", () => {
    const totals = basketTotals({
      cart: cart({
        fulfillmentMode: "pickup",
        defaultDropoff: null,
        clientQuote: quote({ deliveryLines: [], deliveryFeeMinor: 0, pickupFeeMinor: 0, totalMinor: 110000 }),
      }),
      settings: SETTINGS,
    });
    expect(totals.legs).toEqual([]);
    expect(totals.pickupFeeMinor).toBe(0);
    expect(totals.deliveryFeeMinor).toBe(0);
    expect(totals.totalMinor).toBe(110000);
  });

  it("has no total while GRIDGO says why not", () => {
    const totals = basketTotals({
      cart: cart({
        defaultDropoff: null,
        clientQuote: quote({
          status: "incomplete",
          reasons: [{ code: "dropoff_required", lineIds: ["cline_1"] }],
          deliveryLines: [{ lineIds: ["cline_1"], distanceZone: null, deliveryFeeMinor: null }],
          deliveryFeeMinor: null,
          totalMinor: null,
          downpaymentMinor: null,
          balanceMinor: null,
        }),
      }),
      settings: SETTINGS,
    });
    expect(totals.totalMinor).toBeNull();
    expect(totals.deliveryFeeMinor).toBeNull();
    expect(totals.legs[0].feeMinor).toBeNull();
    expect(totals.reasons.map((reason) => reason.code)).toEqual(["dropoff_required"]);
  });

  it("on an API without the quote, prices printing from GRIDGO's line figures and leaves delivery unknown", () => {
    const totals = basketTotals({
      cart: cart({ lines: [line({ clientLineSubtotalMinor: 110000 })] }),
      settings: SETTINGS,
    });
    expect(totals.clientItemSubtotalMinor).toBe(110000);
    expect(totals.deliveryFeeMinor).toBeNull();
    expect(totals.totalMinor).toBeNull();
  });

  it("on an API without the quote, a pick-up costs nothing to collect", () => {
    const totals = basketTotals({
      cart: cart({ fulfillmentMode: "pickup", lines: [line({ clientLineSubtotalMinor: 110000 })] }),
      settings: { ...SETTINGS, downpaymentPercent: 75 },
    });
    expect(totals.totalMinor).toBe(110000);
    expect(totals.downpaymentMinor).toBe(82500);
    expect(totals.balanceMinor).toBe(27500);
  });
});

describe("what the basket is still missing", () => {
  it("names the lines GRIDGO could not price", () => {
    const lines = [line({ id: "a" }), line({ id: "b", lineSubtotalMinor: null })];
    expect(linesUnpriced(lines).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("reads GRIDGO's own line figure for that, not the shop's", () => {
    const lines = [
      line({ id: "a", lineSubtotalMinor: 4000, clientLineSubtotalMinor: null }),
      line({ id: "b", lineSubtotalMinor: null, clientLineSubtotalMinor: 4400 }),
    ];
    expect(linesUnpriced(lines).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("names the lines with no file on them", () => {
    const lines = [line({ id: "a" }), line({ id: "b", artworkFileId: null })];
    expect(linesMissingArtwork(lines).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("counts a line as addressed when the basket's own address covers it", () => {
    expect(linesMissingDropoff(cart())).toEqual([]);
    expect(linesMissingDropoff(cart({ defaultDropoff: null }))).toHaveLength(1);
    expect(
      linesMissingDropoff(cart({ defaultDropoff: null, lines: [line({ dropoff: NEARBY })] })),
    ).toEqual([]);
  });

  it("asks for no address at all when the client is collecting", () => {
    expect(
      linesMissingDropoff(cart({ fulfillmentMode: "pickup", defaultDropoff: null })),
    ).toEqual([]);
  });
});
