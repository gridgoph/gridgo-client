import type { Cart, CartLineRecord, PlatformSettings } from "@/lib/api";
import {
  basketTotals,
  clientLineAmountMinor,
  deliveryFeeForDistance,
  DOWNPAYMENT_RATE_BPS,
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

const SHOP = { lat: 7.0731, lng: 125.6128 };
const NEARBY = { lat: 7.076, lng: 125.615, label: "Home" };
const ACROSS_TOWN = { lat: 7.19, lng: 125.455, label: "Site" };

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

const POINTS = { user_shop: SHOP, other: ACROSS_TOWN };

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
    expect(groups[0].subtotalMinor).toBe(4500);
    expect(groups[0].clientSubtotalMinor).toBe(4950);
    expect(groups[1].subtotalMinor).toBe(1000);
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

  it("has no subtotal at all while one of its lines has no price", () => {
    // GRIDGO answers `lineSubtotalMinor: null` for a line its pricer refused
    // (a quantity under the shop's minimum). Adding it up as zero is what put
    // "PHP 0.00" over a lanyard that costs PHP 50.00.
    const groups = printRuns([
      line({ id: "a", lineSubtotalMinor: 4000 }),
      line({ id: "b", lineSubtotalMinor: null }),
    ]);
    expect(groups[0].subtotalMinor).toBeNull();
  });
});

describe("basketTotals", () => {
  it("adds the platform's fee to the shop's own prices", () => {
    const totals = basketTotals({
      cart: cart(),
      settings: SETTINGS,
      shopPoints: POINTS,
    });

    expect(totals.itemSubtotalMinor).toBe(100000);
    expect(totals.serviceFeeMinor).toBe(10000);
    expect(totals.clientItemSubtotalMinor).toBe(110000);
    expect(totals.deliveryFeeMinor).toBe(2500);
    expect(totals.totalMinor).toBe(112500);
    expect(totals.totalMinor).toBe(totals.clientItemSubtotalMinor + totals.deliveryFeeMinor!);
  });

  it("states the items at GRIDGO's price, so Items plus Delivery is the Total", () => {
    const totals = basketTotals({ cart: cart(), settings: SETTINGS, shopPoints: POINTS });

    // The shop's PHP 1,000.00 plus GRIDGO's 10% is what the client is charged
    // for the items; there is no separate fee row for them to add up.
    expect(totals.gridgoItemsMinor).toBe(110000);
    expect(totals.gridgoItemsMinor! + totals.deliveryFeeMinor!).toBe(totals.totalMinor);
  });

  it("has no items figure and no total while a line has no price", () => {
    const totals = basketTotals({
      cart: cart({ lines: [line({ id: "a" }), line({ id: "b", lineSubtotalMinor: null })] }),
      settings: SETTINGS,
      shopPoints: POINTS,
    });

    expect(totals.itemSubtotalMinor).toBeNull();
    expect(totals.gridgoItemsMinor).toBeNull();
    expect(totals.totalMinor).toBeNull();
    expect(totals.downpaymentMinor).toBeNull();
    // Delivery is still known: the address is set and the run is one press.
    expect(totals.deliveryFeeMinor).toBe(2500);
  });

  it("splits the total 75/25 the way checkout does", () => {
    const totals = basketTotals({
      cart: cart(),
      settings: SETTINGS,
      shopPoints: POINTS,
    });

    expect(DOWNPAYMENT_RATE_BPS).toBe(7500);
    expect(totals.downpaymentMinor).toBe(roundBps(112500, 7500));
    expect(totals.balanceMinor).toBe(112500 - roundBps(112500, 7500));
    expect(totals.downpaymentMinor! + totals.balanceMinor!).toBe(totals.totalMinor);
  });

  it("never lets delivery into the fee base", () => {
    const near = basketTotals({
      cart: cart(),
      settings: SETTINGS,
      shopPoints: POINTS,
    });
    const far = basketTotals({
      cart: cart({ defaultDropoff: ACROSS_TOWN }),
      settings: SETTINGS,
      shopPoints: POINTS,
    });

    expect(far.deliveryFeeMinor).toBeGreaterThan(near.deliveryFeeMinor!);
    expect(far.serviceFeeMinor).toBe(near.serviceFeeMinor);
  });

  it("has no total at all until it knows where the job is going", () => {
    // A partial delivery figure is worse than none: a total that quietly moves
    // is what a client argues about at the counter.
    const totals = basketTotals({
      cart: cart({ defaultDropoff: null }),
      settings: SETTINGS,
      shopPoints: POINTS,
    });

    expect(totals.itemSubtotalMinor).toBe(100000);
    expect(totals.legs[0].feeMinor).toBeNull();
    expect(totals.deliveryFeeMinor).toBeNull();
    expect(totals.totalMinor).toBeNull();
    expect(totals.downpaymentMinor).toBeNull();
  });

  it("charges no delivery at all when the client is collecting", () => {
    const totals = basketTotals({
      cart: cart({ fulfillmentMode: "pickup", defaultDropoff: null }),
      settings: SETTINGS,
      shopPoints: POINTS,
    });

    expect(totals.legs).toEqual([]);
    expect(totals.deliveryFeeMinor).toBe(0);
    expect(totals.clientItemSubtotalMinor).toBe(110000);
    expect(totals.totalMinor).toBe(110000);
    expect(totals.totalMinor).toBe(totals.clientItemSubtotalMinor);
  });

  it("prices one leg per shop, because two shops is two drops", () => {
    const totals = basketTotals({
      cart: cart({
        lines: [
          line({ id: "a", lineSubtotalMinor: 50000 }),
          line({ id: "b", supplierId: "other", lineSubtotalMinor: 50000 }),
        ],
      }),
      settings: SETTINGS,
      shopPoints: POINTS,
    });

    expect(totals.legs.map((leg) => leg.runLabel)).toEqual(["Print run 1", "Print run 2"]);
    expect(totals.legs[0].feeMinor).toBe(2500);
    expect(totals.legs[1].feeMinor).toBe(7500);
    expect(totals.deliveryFeeMinor).toBe(10000);
    expect(totals.clientItemSubtotalMinor).toBe(110000);
    expect(totals.totalMinor).toBe(totals.clientItemSubtotalMinor + totals.deliveryFeeMinor!);
  });

  it("charges each shop for the farthest drop it has to reach", () => {
    // The rule checkout applies: a run split across addresses is priced on the
    // longest leg per shop, not the nearest.
    const totals = basketTotals({
      cart: cart({
        lines: [
          line({ id: "a", lineSubtotalMinor: 50000, dropoff: NEARBY }),
          line({ id: "b", lineSubtotalMinor: 50000, dropoff: ACROSS_TOWN }),
        ],
      }),
      settings: SETTINGS,
      shopPoints: POINTS,
    });

    expect(totals.legs).toHaveLength(1);
    expect(totals.legs[0].feeMinor).toBe(7500);
  });

  it("withholds the whole delivery figure when one leg cannot be priced", () => {
    const totals = basketTotals({
      cart: cart({
        lines: [line({ id: "a" }), line({ id: "b", supplierId: "unknown" })],
      }),
      settings: SETTINGS,
      shopPoints: POINTS,
    });

    expect(totals.legs[0].feeMinor).toBe(2500);
    expect(totals.legs[1].feeMinor).toBeNull();
    expect(totals.deliveryFeeMinor).toBeNull();
    expect(totals.totalMinor).toBeNull();
  });

  it("shows no fee and no total while GRIDGO's charges are unread", () => {
    const totals = basketTotals({
      cart: cart(),
      settings: null,
      shopPoints: POINTS,
    });

    expect(totals.serviceFeeMinor).toBe(0);
    expect(totals.gridgoItemsMinor).toBeNull();
    expect(totals.totalMinor).toBeNull();
  });
});

describe("what the basket is still missing", () => {
  it("names the lines GRIDGO could not price", () => {
    const lines = [line({ id: "a" }), line({ id: "b", lineSubtotalMinor: null })];
    expect(linesUnpriced(lines).map((entry) => entry.id)).toEqual(["b"]);
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
