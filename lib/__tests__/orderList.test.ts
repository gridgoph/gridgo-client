import type { Order } from "@/lib/api";
import {
  DEFAULT_ORDER_SORT,
  ORDER_CONTROLS_MIN,
  ORDER_SORTS,
  emptyResultBody,
  filterCounts,
  hasPaymentDue,
  isDoneOrder,
  matchesQuery,
  sortBlurb,
  sortLabel,
  sortOrders,
  visibleOrders,
} from "@/lib/orderList";

/**
 * Finding one job among many.
 *
 * The rules here are the ones a client would state out loud — what needs me,
 * where is the flyers job, what have I not paid for — so the tests are written
 * as those questions rather than as filter identifiers.
 */
function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "user_client",
    supplierId: null,
    riderId: null,
    state: "production",
    productId: "prod_flyers",
    title: "Flyers",
    quantity: 1,
    size: "A5",
    material: "matte_150gsm",
    deadline: null,
    address: "JP Laurel Ave, Davao City",
    zone: "davao_central",
    subtotalMinor: 44000,
    deliveryFeeMinor: 0,
    totalMinor: 44000,
    downpaymentMinor: 33000,
    balanceMinor: 11000,
    paymentMethod: "qr_manual",
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
    timeline: [],
    payments: {
      downpayment: {
        amountMinor: 33000,
        method: "qr_manual",
        status: "confirmed",
        reference: null,
        submittedAt: null,
        confirmedAt: null,
      },
      balance: {
        amountMinor: 11000,
        method: "qr_manual",
        status: "confirmed",
        reference: null,
        submittedAt: null,
        confirmedAt: null,
      },
    },
    ...overrides,
  };
}

/** The same job with its second half still owed. */
function owing(overrides: Partial<Order> = {}): Order {
  const base = order(overrides);
  return {
    ...base,
    payments: {
      downpayment: { ...base.payments!.downpayment, status: "confirmed" },
      balance: { ...base.payments!.balance, status: "not_submitted" },
    },
  };
}

describe("isDoneOrder", () => {
  it("counts only the states where nothing is still moving", () => {
    expect(isDoneOrder(order({ state: "completed" }))).toBe(true);
    expect(isDoneOrder(order({ state: "payout_released" }))).toBe(true);
    expect(isDoneOrder(order({ state: "cancelled" }))).toBe(true);

    // Delivered is not done: the client still has an issue window to use, and
    // filing it away as finished hides the one step where they can complain.
    expect(isDoneOrder(order({ state: "delivered" }))).toBe(false);
    expect(isDoneOrder(order({ state: "issue_window_open" }))).toBe(false);
    expect(isDoneOrder(order({ state: "awaiting_collection" }))).toBe(false);
  });
});

describe("hasPaymentDue", () => {
  it("is money the client still owes, not money under review", () => {
    expect(hasPaymentDue(owing())).toBe(true);
    expect(hasPaymentDue(order())).toBe(false);

    const submitted = owing();
    submitted.payments!.balance.status = "pending_confirmation";
    expect(hasPaymentDue(submitted)).toBe(false);
  });
});

describe("matchesQuery", () => {
  const flyers = order({ title: "Flyers", size: "A5", material: "matte_150gsm" });

  it("matches what the card itself shows, codes included", () => {
    expect(matchesQuery(flyers, "flyers")).toBe(true);
    expect(matchesQuery(flyers, "A5")).toBe(true);
    expect(matchesQuery(flyers, "matte")).toBe(true);
  });

  it("narrows on every word rather than widening", () => {
    expect(matchesQuery(flyers, "a5 flyers")).toBe(true);
    expect(matchesQuery(flyers, "a4 flyers")).toBe(false);
  });

  it("an empty search hides nothing", () => {
    expect(matchesQuery(flyers, "")).toBe(true);
    expect(matchesQuery(flyers, "   ")).toBe(true);
  });
});

describe("sortOrders", () => {
  const older = order({
    id: "old",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    totalMinor: 90000,
  });
  const newer = order({
    id: "new",
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T10:00:00.000Z",
    totalMinor: 10000,
  });
  const unpriced = order({
    id: "none",
    createdAt: "2026-08-15T10:00:00.000Z",
    updatedAt: "2026-08-15T10:00:00.000Z",
    totalMinor: null,
    subtotalMinor: null,
  });

  it("orders by when it was placed, both ways", () => {
    expect(sortOrders([older, newer], "newest").map((o) => o.id)).toEqual(["new", "old"]);
    expect(sortOrders([newer, older], "oldest").map((o) => o.id)).toEqual(["old", "new"]);
  });

  it("leads by default with whatever moved last, not what was sent last", () => {
    // The job that matters is the one something just happened to. An order
    // placed three weeks ago whose supplier accepted this morning was buried
    // under quieter jobs sent after it.
    const stirred = order({
      id: "stirred",
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-08-25T10:00:00.000Z",
    });
    expect(DEFAULT_ORDER_SORT).toBe("recent");
    expect(sortOrders([newer, older, stirred], "recent").map((o) => o.id)).toEqual([
      "stirred",
      "new",
      "old",
    ]);
  });

  it("falls back to when a job was placed if it has never been touched", () => {
    // A missing or unparseable timestamp must not sink a live job to the
    // bottom of the list it is meant to lead.
    const untouched = order({
      id: "untouched",
      createdAt: "2026-08-30T10:00:00.000Z",
      updatedAt: "",
    });
    expect(sortOrders([newer, untouched], "recent")[0].id).toBe("untouched");
  });

  it("sinks an unpriced job rather than reading it as free", () => {
    expect(sortOrders([unpriced, newer, older], "price").map((o) => o.id)).toEqual([
      "old",
      "new",
      "none",
    ]);
  });
});

describe("filterCounts and visibleOrders", () => {
  const list = [
    owing({ id: "owed", title: "Permit plan set", createdAt: "2026-08-20T10:00:00.000Z" }),
    order({ id: "running", createdAt: "2026-08-18T10:00:00.000Z" }),
    order({ id: "closed", state: "completed", createdAt: "2026-08-02T10:00:00.000Z" }),
  ];

  it("counts each filter against the same list", () => {
    const counts = filterCounts(list);
    expect(counts.all).toBe(3);
    expect(counts.active).toBe(2);
    expect(counts.done).toBe(1);
    expect(counts.payment_due).toBe(1);
    expect(counts.needs_you).toBe(1);
  });

  it("filters and sorts together", () => {
    expect(visibleOrders(list, { filter: "done", sort: "newest", query: "" }).map((o) => o.id))
      .toEqual(["closed"]);
    expect(visibleOrders(list, { filter: "all", sort: "newest", query: "permit" }).map((o) => o.id))
      .toEqual(["owed"]);
    expect(visibleOrders(list, { filter: "all", sort: "oldest", query: "" }).map((o) => o.id))
      .toEqual(["closed", "running", "owed"]);
  });
});

describe("sort copy", () => {
  it("names what each order actually sorts by", () => {
    // The control was an unmarked pair of arrows, which can only be understood
    // by pressing it. Every option now says what it does, and none of the four
    // may read as another.
    const labels = ORDER_SORTS.map(sortLabel);
    expect(labels).toEqual([
      "Recently updated",
      "Newest first",
      "Oldest first",
      "Highest price",
    ]);
    expect(new Set(labels).size).toBe(labels.length);
    for (const sort of ORDER_SORTS) {
      expect(sortBlurb(sort).length).toBeGreaterThan(0);
      expect(sortBlurb(sort)).not.toMatch(/_/);
    }
  });
});

describe("emptyResultBody", () => {
  it("says why the screen is empty, not just that it is", () => {
    expect(emptyResultBody("all", "hexagon")).toMatch(/hexagon/);
    expect(emptyResultBody("needs_you", "")).toMatch(/waiting on you/i);
    expect(emptyResultBody("payment_due", "")).toMatch(/unpaid/i);
  });
});

describe("ORDER_CONTROLS_MIN", () => {
  it("keeps the controls off a list short enough to read", () => {
    // Three jobs are read, not searched. The number is the rule, so it is
    // asserted rather than left to whoever next edits the screen.
    expect(ORDER_CONTROLS_MIN).toBe(4);
  });
});
