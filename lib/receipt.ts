/**
 * The client's acknowledgement receipt, from the invoice snapshot.
 *
 * `GET /orders/:id/invoice` is the authority: print, delivery, the service
 * fee, the total, and the invoice number. The order adds the payment
 * reference the client typed and the job reference they already know.
 */

import type { Invoice, Order, OrderPayments } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { orderReference } from "@/lib/orderReference";
import { showsServiceFee } from "@/lib/serviceFee";

export const RECEIPT_HEADLINE = "Order receipt";
export const RECEIPT_BLURB =
  "This is GRIDGO's acknowledgement that the order was placed. It is not a BIR official receipt.";

/** How checkout lands on the receipt so Back cannot reopen the request. */
export const RECEIPT_FROM_CHECKOUT = "checkout";
export const ORDERS_TAB = "/(tabs)/orders";

type ReceiptLandingRouter = {
  dismissTo: (href: typeof ORDERS_TAB) => void;
  push: (href: {
    pathname: "/order/receipt";
    params: { orderId: string; from: typeof RECEIPT_FROM_CHECKOUT };
  }) => void;
};

/**
 * After place, the request stack is finished work.
 *
 * `replace` only swaps checkout for the receipt, so the header chevron still
 * pops into artwork. Collapse onto Orders first, then push the receipt —
 * Back, the gesture, and the Android arrow all land on the orders tab.
 */
export function openReceiptAfterCheckout(router: ReceiptLandingRouter, orderId: string): void {
  router.dismissTo(ORDERS_TAB);
  router.push({
    pathname: "/order/receipt",
    params: { orderId, from: RECEIPT_FROM_CHECKOUT },
  });
}

export function isCheckoutReceipt(from: string | string[] | undefined): boolean {
  return from === RECEIPT_FROM_CHECKOUT;
}

export type ReceiptMoney = {
  printingMinor: number;
  deliveryFeeMinor: number;
  serviceFeeMinor: number;
  serviceFeeRateBps: number;
  totalMinor: number;
};

export type ReceiptView = {
  invoiceNumber: string;
  orderId: string;
  orderReference: string | null;
  issuedAt: string | null;
  lines: { id: string; name: string; quantity: number; amountLabel: string }[];
  money: ReceiptMoney;
  paymentReference: string | null;
};

/** The QR reference the client sent, from either payment half. */
export function paymentReferenceOf(
  payments: OrderPayments | null | undefined,
): string | null {
  if (!payments) return null;
  const initial = payments.initial ?? payments.downpayment;
  const balance = payments.final_online ?? payments.balance;
  const reference = initial?.reference?.trim() || balance?.reference?.trim();
  return reference || null;
}

export function receiptFromInvoice(invoice: Invoice, order?: Order | null): ReceiptView {
  return {
    invoiceNumber: invoice.invoiceNumber,
    orderId: invoice.orderId,
    orderReference: orderReference(invoice.orderId),
    issuedAt: invoice.issuedAt || null,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      name: line.itemName,
      quantity: line.quantity,
      amountLabel: formatPhp(line.amountMinor),
    })),
    money: {
      printingMinor: invoice.itemSubtotalMinor,
      deliveryFeeMinor: invoice.deliveryFeeMinor,
      serviceFeeMinor: invoice.serviceFeeMinor,
      serviceFeeRateBps: invoice.serviceFeeRateBps,
      totalMinor: invoice.totalMinor,
    },
    paymentReference: paymentReferenceOf(order?.payments) ?? null,
  };
}

/**
 * A receipt built from the order alone, when the invoice snapshot is missing.
 *
 * Older jobs never wrote one. The figures the client is owed still exist on
 * the order, so the screen can show them rather than a dead end.
 */
export function receiptFromOrder(order: Order): ReceiptView | null {
  if (order.subtotalMinor == null || order.totalMinor == null) return null;
  const serviceFeeMinor = order.serviceFeeMinor ?? 0;
  const serviceFeeRateBps = order.serviceFeeRateBps ?? 0;
  return {
    invoiceNumber: order.invoiceNumber ?? "",
    orderId: order.id,
    orderReference: orderReference(order.id),
    issuedAt: order.createdAt,
    lines: order.title
      ? [{ id: order.id, name: order.title, quantity: order.quantity, amountLabel: formatPhp(order.subtotalMinor) }]
      : [],
    money: {
      printingMinor: order.subtotalMinor,
      deliveryFeeMinor: order.deliveryFeeMinor ?? 0,
      serviceFeeMinor,
      serviceFeeRateBps,
      totalMinor: order.totalMinor,
    },
    paymentReference: paymentReferenceOf(order.payments),
  };
}

export function receiptShowsFee(money: Pick<ReceiptMoney, "serviceFeeMinor" | "serviceFeeRateBps">): boolean {
  return showsServiceFee(money);
}
