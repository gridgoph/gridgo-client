import type { Invoice, Order } from "@/lib/api";
import {
  openReceiptAfterCheckout,
  paymentReferenceOf,
  receiptFromInvoice,
  receiptEntryShown,
  receiptFromOrder,
} from "@/lib/receipt";

const invoice: Invoice = {
  invoiceNumber: "GG-20260824-0001",
  orderId: "ord_3ff0128e105a",
  issuedAt: "2026-08-24T01:00:00.000Z",
  currency: "PHP",
  lines: [
    {
      id: "line_1",
      jobId: "job_1",
      itemName: "Flyers",
      quantity: 100,
      unitPriceMinor: 4000,
      amountMinor: 4000,
      artworkFileId: null,
      mockupFileId: null,
      dropoff: null,
    },
  ],
  itemSubtotalMinor: 4000,
  serviceFeeRateBps: 1000,
  serviceFeeMinor: 400,
  deliveryLines: [{ jobId: "job_1", shopName: "Shop", amountMinor: 2500 }],
  deliveryFeeMinor: 2500,
  totalMinor: 6900,
  paymentPlan: { method: "qr_manual", downpaymentMinor: 5175, balanceMinor: 1725 },
};

describe("receiptFromInvoice", () => {
  it("shows GRIDGO printing, delivery and total from the invoice snapshot", () => {
    const view = receiptFromInvoice(invoice, {
      payments: {
        initial: {
          amountMinor: 5175,
          method: "qr_manual",
          status: "pending_confirmation",
          reference: "1234567890123",
          submittedAt: "2026-08-24T01:00:00.000Z",
          confirmedAt: null,
        },
      },
    } as Order);

    expect(view.invoiceNumber).toBe("GG-20260824-0001");
    expect(view.orderReference).toBe("3FF0-128E-105A");
    expect(view.money).toEqual({
      printingMinor: 4400,
      deliveryFeeMinor: 2500,
      pickup: false,
      serviceFeeMinor: 400,
      serviceFeeRateBps: 1000,
      totalMinor: 6900,
    });
    expect(view.paymentReference).toBe("1234567890123");
    expect(view.lines[0]?.name).toBe("Flyers");
    expect(view.lines[0]?.amountLabel).toBe("₱44.00");
  });
});

describe("receiptFromInvoice with a voucher (gridgo-api#204)", () => {
  it("keeps Printing and Delivery as charged and carries the voucher as its own line", () => {
    const view = receiptFromInvoice({
      ...invoice,
      totalMinor: 5400,
      voucher: { id: "vch_1", label: "GRIDGO-funded voucher", amountMinor: 1500 },
      voucherDiscountMinor: 1500,
    });
    expect(view.money).toMatchObject({ printingMinor: 4400, deliveryFeeMinor: 2500, voucherDiscountMinor: 1500, totalMinor: 5400 });
    expect(view.money.printingMinor + view.money.deliveryFeeMinor - (view.money.voucherDiscountMinor ?? 0)).toBe(view.money.totalMinor);
  });
});

describe("paymentReferenceOf", () => {
  it("reads the downpayment reference first", () => {
    expect(
      paymentReferenceOf({
        downpayment: {
          amountMinor: 1,
          method: "qr_manual",
          status: "confirmed",
          reference: "GCASH-ABC",
          submittedAt: null,
          confirmedAt: null,
        },
      }),
    ).toBe("GCASH-ABC");
  });
});

describe("openReceiptAfterCheckout", () => {
  it("collapses onto Orders before opening the receipt", () => {
    const router = { dismissTo: jest.fn(), push: jest.fn() };
    openReceiptAfterCheckout(router, "ord_1");
    expect(router.dismissTo).toHaveBeenCalledWith("/(tabs)/orders");
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/order/receipt",
      params: { orderId: "ord_1", from: "checkout" },
    });
  });
});

describe("receiptFromOrder", () => {
  it("is null before the order is priced", () => {
    expect(
      receiptFromOrder({
        id: "ord_1",
        subtotalMinor: null,
        totalMinor: null,
      } as Order),
    ).toBeNull();
  });

  it("folds the snapshotted fee into printing so the receipt does not charge it twice", () => {
    const view = receiptFromOrder({
      id: "ord_1",
      title: "Flyers",
      quantity: 100,
      subtotalMinor: 4000,
      serviceFeeMinor: 400,
      serviceFeeRateBps: 1000,
      deliveryFeeMinor: 2500,
      totalMinor: 6900,
      createdAt: "2026-08-24T00:00:00.000Z",
    } as Order);

    expect(view?.money.printingMinor).toBe(4400);
    expect(view?.money.totalMinor).toBe(6900);
    expect(view?.lines[0]?.amountLabel).toBe("₱44.00");
  });
});

describe("receiptEntryShown", () => {
  const paid = (status: string, reference: string | null = "GCASH-1") => ({
    initial: { amountMinor: 100, method: "qr_manual", status, reference, submittedAt: null, confirmedAt: null },
  });

  it("offers the receipt at every status once the order is paid for", () => {
    expect(receiptEntryShown({ invoiceNumber: "GG-1", payments: undefined })).toBe(true);
    expect(receiptEntryShown({ invoiceNumber: null, payments: paid("pending_confirmation") })).toBe(true);
    expect(receiptEntryShown({ invoiceNumber: null, payments: paid("confirmed") })).toBe(true);
    // A rejected reference is still a receipt GRIDGO issued at checkout.
    expect(receiptEntryShown({ invoiceNumber: "GG-1", payments: paid("rejected", null) })).toBe(true);
  });

  it("offers nothing before any payment or invoice", () => {
    expect(receiptEntryShown({ invoiceNumber: null, payments: paid("not_submitted", null) })).toBe(false);
    expect(receiptEntryShown({ invoiceNumber: "  ", payments: undefined })).toBe(false);
  });
});
