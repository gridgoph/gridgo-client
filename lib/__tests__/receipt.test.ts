import type { Invoice, Order } from "@/lib/api";
import {
  openReceiptAfterCheckout,
  paymentReferenceOf,
  receiptFromInvoice,
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
  it("shows print, delivery, service fee, total and the job reference", () => {
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
      printingMinor: 4000,
      deliveryFeeMinor: 2500,
      serviceFeeMinor: 400,
      serviceFeeRateBps: 1000,
      totalMinor: 6900,
    });
    expect(view.paymentReference).toBe("1234567890123");
    expect(view.lines[0]?.name).toBe("Flyers");
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
});
