import type { CatalogItem, Invoice, RefundSettlement } from "@/lib/api";
import { optionClientDeltaMinor } from "@/components/OptionGroupPicker";
import { clientFigureMinor, startsFromBase } from "@/lib/gridgoPrice";
import { clientLineEstimateMinor, clientUnitDisplayMinor } from "@/lib/listing";
import { receiptFromInvoice, receiptFulfilmentRow } from "@/lib/receipt";
import { refundBreakdown } from "@/lib/refunds";
import { orderPrintingMinor } from "@/lib/serviceFee";
import { fromPriceKey } from "@/lib/shopBoards";

/*
  gridgo-api#132 phase 2: the API sends GRIDGO's own figures beside the shop's,
  and every client surface reads those. They are already inside the fee, so
  nothing here may mark them up again; the shop figure is read only by an
  older payload that has no client field.
*/

const ITEM = {
  id: "sci_flyers",
  basePriceMinor: 2000,
  clientBasePriceMinor: 2200,
  fromPriceMinor: 2000,
  clientFromPriceMinor: 2200,
  optionGroups: [
    {
      id: "grp_paper",
      name: "Paper",
      kind: "spec",
      required: true,
      sortOrder: 0,
      options: [
        { id: "opt_matte", label: "Matte", priceModifierMinor: 500, clientPriceModifierMinor: 550, sortOrder: 0 },
        { id: "opt_gloss", label: "Gloss", priceModifierMinor: 300, clientPriceModifierMinor: 330, sortOrder: 1 },
      ],
    },
    {
      id: "grp_lam",
      name: "Lamination",
      kind: "addon",
      required: false,
      sortOrder: 1,
      options: [
        { id: "opt_lam", label: "Laminate", priceModifierMinor: -100, clientPriceModifierMinor: -110, sortOrder: 0 },
      ],
    },
  ],
} as unknown as CatalogItem;

describe("client figures are drawn as sent", () => {
  it("never marks up a client amount, and marks up a shop amount once", () => {
    expect(clientFigureMinor(2200, 2000, 1000)).toBe(2200);
    expect(clientFigureMinor(null, 2000, 1000)).toBe(2200);
    expect(clientFigureMinor(undefined, 2000, null)).toBeNull();
  });

  it("reads 'From' on GRIDGO's figures when both are sent", () => {
    expect(startsFromBase(ITEM)).toBe(false);
    expect(startsFromBase({ ...ITEM, clientFromPriceMinor: 2530 })).toBe(true);
    // An older payload compares the shop's own two.
    expect(startsFromBase({ basePriceMinor: 2000, fromPriceMinor: 2300 })).toBe(true);
  });

  it("sorts on the figure the client reads", () => {
    expect(fromPriceKey({ fromPriceMinor: 2000, clientFromPriceMinor: 2200 })).toBe(2200);
    expect(fromPriceKey({ fromPriceMinor: 2000 })).toBe(2000);
  });

  it("states an option at GRIDGO's figure, sign and all", () => {
    expect(optionClientDeltaMinor({ priceModifierMinor: -100, clientPriceModifierMinor: -110 }, null)).toBe(-110);
    expect(optionClientDeltaMinor({ priceModifierMinor: 300 }, 1000)).toBe(330);
    expect(optionClientDeltaMinor({ priceModifierMinor: 300 }, null)).toBeNull();
  });
});

describe("the listing sheet", () => {
  it("adds the picked options' client figures to the client base", () => {
    expect(clientUnitDisplayMinor(ITEM, {})).toBe(2200);
    expect(clientUnitDisplayMinor(ITEM, { grp_paper: "opt_gloss", grp_lam: "opt_lam" })).toBe(2420);
  });

  it("has no header figure of its own on a payload without client fields", () => {
    const older = { ...ITEM, clientBasePriceMinor: undefined } as unknown as CatalogItem;
    expect(clientUnitDisplayMinor(older, {})).toBeNull();
  });

  it("estimates an unfinished selection at the client rates, as the bar always did", () => {
    const item = { ...ITEM, pricingUnit: "per_unit", measurementKind: "none", priceTiers: [] } as unknown as CatalogItem;
    // Nothing picked: the client base for each, never the cheapest option.
    expect(clientLineEstimateMinor(item, 3, null, {})).toBe(6600);
    expect(clientLineEstimateMinor(item, 3, null, { grp_lam: "opt_lam" })).toBe(3 * (2200 - 110));
  });

  it("swaps in a reached quantity tier at its client rate", () => {
    const item = {
      ...ITEM,
      pricingUnit: "per_unit",
      measurementKind: "none",
      priceTiers: [{ minQuantity: 10, unitPriceMinor: 1800, clientUnitPriceMinor: 1980 }],
    } as unknown as CatalogItem;
    expect(clientLineEstimateMinor(item, 10, null, {})).toBe(19800);
  });

  it("has no estimate on a payload without client figures", () => {
    const older = {
      ...ITEM,
      pricingUnit: "per_unit",
      measurementKind: "none",
      priceTiers: [{ minQuantity: 10, unitPriceMinor: 1800 }],
    } as unknown as CatalogItem;
    expect(clientLineEstimateMinor(older, 1, null, {})).toBeNull();
  });
});

describe("a placed order's printing", () => {
  it("is the saved total less the saved fulfilment charge", () => {
    expect(orderPrintingMinor({ totalMinor: 6900, deliveryFeeMinor: 2500 })).toBe(4400);
    // A pick-up chosen before matching carries its hub fee in the same slot.
    expect(orderPrintingMinor({ totalMinor: 4900, deliveryFeeMinor: 500 })).toBe(4400);
  });

  it("falls back to items plus fee on a legacy order with no total yet", () => {
    expect(
      orderPrintingMinor({ totalMinor: null, deliveryFeeMinor: null, subtotalMinor: 4000, serviceFeeMinor: 400 }),
    ).toBe(4400);
    expect(orderPrintingMinor({ totalMinor: null, deliveryFeeMinor: null, subtotalMinor: null })).toBeNull();
  });
});

const INVOICE: Invoice = {
  invoiceNumber: "GG-20261005-0001",
  orderId: "ord_3ff0128e105a",
  issuedAt: "2026-10-05T01:00:00.000Z",
  currency: "PHP",
  lines: [
    {
      id: "line_1",
      jobId: "job_1",
      itemName: "Flyers",
      quantity: 3,
      clientUnitPriceMinor: 1733,
      clientAmountMinor: 5200,
      artworkFileId: null,
      mockupFileId: null,
      dropoff: null,
    },
  ],
  clientItemSubtotalMinor: 5199,
  deliveryLines: [{ jobId: "job_1", amountMinor: 0 }],
  deliveryFeeMinor: 0,
  totalMinor: 5199,
  paymentPlan: { method: "qr_manual", downpaymentMinor: 5199, balanceMinor: 0 },
};

describe("the receipt", () => {
  it("reads the invoice's own client figures, with no shop figure or name to hand", () => {
    const view = receiptFromInvoice(INVOICE);
    // The aggregate is rounded once and is what is charged; a line may differ
    // from it by a centavo.
    expect(view.money.printingMinor).toBe(5199);
    expect(view.lines[0].amountLabel).toBe("₱52.00");
    expect(view.money.printingMinor + view.money.deliveryFeeMinor).toBe(view.money.totalMinor);
  });

  it("names a pick-up's hub fee, and reads nothing charged as collecting", () => {
    const view = receiptFromInvoice({ ...INVOICE, pickupFeeMinor: 5000, deliveryFeeMinor: 5000, totalMinor: 10199 });
    expect(receiptFulfilmentRow(view.money)).toEqual({ label: "Pick-up fee", value: "₱50.00" });
    expect(receiptFulfilmentRow(receiptFromInvoice({ ...INVOICE, pickupFeeMinor: 0 }).money)).toEqual({
      label: "Delivery",
      value: "None — you collect",
    });
  });
});

describe("a refund", () => {
  const settlement = { principalMinor: 4000, feeMinor: 400, deliveryMinor: 0, totalMinor: 4400 } as RefundSettlement;

  it("measures what was charged for printing from the saved total", () => {
    const breakdown = refundBreakdown(settlement, {
      payments: { initial: { amountMinor: 6900, method: "qr_manual", status: "confirmed", reference: "1", submittedAt: null, confirmedAt: null } },
      totalMinor: 6900,
      deliveryFeeMinor: 2500,
      subtotalMinor: null,
      serviceFeeMinor: null,
      fulfillmentMode: "delivery",
    });
    expect(breakdown.full).toBe(false);
    // Printing was returned whole; only the delivery trip was kept.
    expect(breakdown.kept).toBe("The rest pays for the delivery trip that was made.");
  });
});
