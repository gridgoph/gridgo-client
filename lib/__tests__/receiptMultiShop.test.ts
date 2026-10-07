import { printRuns } from "@/lib/basket";
import {
  receiptFromCheckout,
  receiptFromInvoice,
  receiptFulfilmentRow,
  withBasket,
  withGroupStanding,
} from "@/lib/receipt";
import {
  combinedInvoice,
  DATE_EARLY,
  DATE_LATE,
  DATE_MID,
  datedBasket,
  datedInvoice,
  multiCart,
  placedBasket,
} from "@/test/multiShopFixtures";

describe("the combined multi-shop receipt", () => {
  it("has a section per shop group, in GRIDGO's own figures", () => {
    const view = receiptFromInvoice(combinedInvoice());
    expect(view.groups?.map((group) => [group.label, group.letter, group.totalMinor])).toEqual([
      ["Shop A", "A", 46500],
      ["Shop B", "B", 24800],
      ["Shop C", "C", 10420],
    ]);
    expect(view.groups?.[0].lines).toEqual([
      { id: "li_0", name: "Flyers", quantity: 1, amountLabel: "₱440.00" },
    ]);
    expect(view.groups?.[1].deliveryFeeMinor).toBe(5000);
  });

  it("adds printing and delivery to the one total, with no shop figure to fall back on", () => {
    const view = receiptFromInvoice(combinedInvoice());
    expect(view.money.printingMinor).toBe(71720);
    expect(view.money.deliveryFeeMinor).toBe(10000);
    expect(view.money.printingMinor + view.money.deliveryFeeMinor).toBe(view.money.totalMinor);
    // The client receipt withholds the fee split; nothing may read NaN.
    expect(view.money.serviceFeeMinor).toBeNull();
    expect(view.money.serviceFeeRateBps).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/NaN/);
  });

  it("names the hub pick-up fee once, and delivery across the shops", () => {
    const pickup = receiptFromInvoice({ ...combinedInvoice(), pickupFeeMinor: 2501, deliveryFeeMinor: 2501 });
    expect(receiptFulfilmentRow(pickup.money, pickup.groups?.length)).toEqual({
      label: "Pick-up fee, once per order",
      value: "₱25.01",
    });
    const delivered = receiptFromInvoice(combinedInvoice());
    expect(receiptFulfilmentRow(delivered.money, delivered.groups?.length).label).toBe("Delivery · 3 shops");
    // A single-shop receipt keeps its own words.
    expect(receiptFulfilmentRow(delivered.money).label).toBe("Delivery");
  });

  it("prints paid in full straight from checkout's answer", () => {
    const view = receiptFromCheckout(
      combinedInvoice(),
      {
        id: "ord_a",
        paymentPlan: {
          method: "qr_manual",
          downpaymentMinor: 46500,
          balanceMinor: 0,
          downpaymentStatus: "pending_confirmation",
          downpaymentPercent: 100,
        },
      },
      "1012345678903",
    );
    expect(view?.paidInFull).toBe(true);
    expect(view?.paymentStatus).toBe("checking");
    expect(view?.groups).toHaveLength(3);
  });

  it("marks a group cancelled since, without touching what was paid", () => {
    const view = withGroupStanding(
      receiptFromInvoice(combinedInvoice()),
      placedBasket(["production", "cancelled", "production"]).groups,
    );
    expect(view.groups?.map((group) => group.stopped ?? null)).toEqual([
      null,
      expect.stringMatching(/^Cancelled/),
      null,
    ]);
    expect(view.money.totalMinor).toBe(81720);
  });

  it("leaves a single-shop receipt as it was", () => {
    const { groups, basketId, clientItemSubtotalMinor, ...single } = combinedInvoice();
    void groups;
    void basketId;
    void clientItemSubtotalMinor;
    const view = receiptFromInvoice({
      ...single,
      lines: [{ ...single.lines[0], amountMinor: 40000, unitPriceMinor: 40000 }],
      itemSubtotalMinor: 40000,
      serviceFeeMinor: 4000,
      serviceFeeRateBps: 1000,
    });
    expect(view.groups).toBeUndefined();
    expect(view.money.printingMinor).toBe(44000);
    expect(withGroupStanding(view, placedBasket().groups)).toBe(view);
  });
});

/*
 * Per-product dates (gridgo-client#189): one receipt, a section per shop and
 * date, soonest first, each saying its date.
 */
describe("the combined receipt over several dates", () => {
  it("orders its sections by date and keeps each group's date and figures", () => {
    const view = receiptFromInvoice(datedInvoice());
    expect(view.groups?.map((group) => [group.label, group.deadline, group.totalMinor])).toEqual([
      ["Shop A", DATE_EARLY, 10420],
      ["Shop B", DATE_MID, 24800],
      ["Shop A", DATE_LATE, 46500],
    ]);
    // The total is the receipt's own, however the sections are ordered.
    expect(view.money.totalMinor).toBe(81720);
  });

  it("says delivery across dates, not across shops", () => {
    const view = receiptFromInvoice(datedInvoice());
    expect(receiptFulfilmentRow(view.money, view.groups)).toEqual({
      label: "Delivery · 3 deliveries",
      value: "₱100.00",
    });
    expect(receiptFulfilmentRow(view.money, receiptFromInvoice(combinedInvoice()).groups).label).toBe(
      "Delivery · 3 shops",
    );
  });

  it("reads a group's date from the placed basket when the receipt has none", () => {
    const invoice = combinedInvoice();
    const view = withBasket(receiptFromInvoice(invoice), datedBasket(["production", "cancelled", "production"]));
    expect(view.groups?.map((group) => [group.orderId, group.deadline])).toEqual([
      ["ord_c", DATE_EARLY],
      ["ord_b", DATE_MID],
      ["ord_a", DATE_LATE],
    ]);
    expect(view.groups?.[1].stopped).toMatch(/^Cancelled/);
  });
});

describe("printRuns on a multi-shop basket", () => {
  it("groups by GRIDGO's group id when shop ids are withheld", () => {
    const runs = printRuns(multiCart(3).lines, 1000);
    expect(runs.map((run) => run.lines.map((line) => line.id))).toEqual([["cline_0"], ["cline_1"], ["cline_2"]]);
    expect(runs.map((run) => run.clientSubtotalMinor)).toEqual([44000, 19800, 7920]);
  });
});
