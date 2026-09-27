/**
 * The client's acknowledgement receipt, from the invoice snapshot.
 *
 * `GET /orders/:id/invoice` is the authority: print, delivery, the snapshotted
 * fee, the total, and the invoice number. The order adds the payment
 * reference the client typed and the job reference they already know.
 *
 * Client surfaces show GRIDGO printing (shop items + the snapshotted fee),
 * then delivery, then total. The fee is not a third charge on top of print.
 */

import type { Invoice, MatchedOrder, Order, OrderPayments } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { gridgoAmountMinor } from "@/lib/gridgoPrice";
import { orderReference } from "@/lib/orderReference";
import { FULL_PAYMENT_PERCENT, isInstallmentConfirmed, paysInFull } from "@/lib/payment";
import { printingMinor, showsServiceFee } from "@/lib/serviceFee";

export const RECEIPT_HEADLINE = "Order receipt";
export const RECEIPT_BLURB =
  "This is GRIDGO's acknowledgement that the order was placed. It is not a BIR official receipt.";

/** How checkout lands on the receipt so Back cannot reopen the request. */
export const RECEIPT_FROM_CHECKOUT = "checkout";
export const ORDERS_TAB = "/(tabs)/orders";
export const HOME_TAB = "/(tabs)/home";

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

/**
 * Where the up-front payment stands. Submitting a reference is not paying:
 * `checking` is the honest state from checkout until Operations confirms it.
 */
export type ReceiptPaymentStatus = "confirmed" | "checking" | "none";

export type ReceiptView = {
  invoiceNumber: string;
  orderId: string;
  orderReference: string | null;
  issuedAt: string | null;
  lines: { id: string; name: string; quantity: number; amountLabel: string }[];
  money: ReceiptMoney;
  paymentReference: string | null;
  /** One transfer covers the whole total; no balance step follows. */
  paidInFull: boolean;
  paymentStatus: ReceiptPaymentStatus;
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

/** The up-front payment's standing, from either payment half's key. */
export function paymentStatusOf(
  payments: OrderPayments | null | undefined,
): ReceiptPaymentStatus {
  const initial = payments?.initial ?? payments?.downpayment;
  if (!initial) return "none";
  if (isInstallmentConfirmed(initial)) return "confirmed";
  return initial.reference?.trim() || initial.status === "pending_confirmation" ? "checking" : "none";
}

function invoicePaidInFull(invoice: Invoice): boolean {
  return invoice.paymentPlan?.balanceMinor === 0;
}

/** The invoice's own figures: printing, delivery and total, plus its lines. */
function invoiceParts(invoice: Invoice) {
  const printing = printingMinor(invoice.itemSubtotalMinor, invoice.serviceFeeMinor);
  return {
    invoiceNumber: invoice.invoiceNumber,
    orderId: invoice.orderId,
    orderReference: orderReference(invoice.orderId),
    issuedAt: invoice.issuedAt || null,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      name: line.itemName,
      quantity: line.quantity,
      amountLabel: formatPhp(
        gridgoAmountMinor(line.amountMinor, invoice.serviceFeeRateBps) ?? line.amountMinor,
      ),
    })),
    money: {
      printingMinor: printing,
      deliveryFeeMinor: invoice.deliveryFeeMinor,
      serviceFeeMinor: invoice.serviceFeeMinor,
      serviceFeeRateBps: invoice.serviceFeeRateBps,
      totalMinor: invoice.totalMinor,
    },
  };
}

export function receiptFromInvoice(invoice: Invoice, order?: Order | null): ReceiptView {
  return {
    ...invoiceParts(invoice),
    paymentReference: paymentReferenceOf(order?.payments) ?? null,
    paidInFull: invoicePaidInFull(invoice) || (order ? paysInFull(order) : false),
    paymentStatus: paymentStatusOf(order?.payments),
  };
}

/**
 * The summary checkout already holds the moment the order is placed.
 *
 * `POST /me/carts/:id/checkout` answers with the order and its invoice, and
 * the client has just typed the reference. Building the slip from that answer
 * is what lets it print straight away instead of waiting on two reads for
 * numbers the phone already has. Null when the answer is not a whole invoice.
 */
export function receiptFromCheckout(
  invoice: Invoice | null | undefined,
  order: Pick<MatchedOrder, "id" | "paymentPlan"> | null | undefined,
  reference: string,
): ReceiptView | null {
  if (!invoice || !order || !Array.isArray(invoice.lines) || typeof invoice.totalMinor !== "number") {
    return null;
  }
  const status = order.paymentPlan?.downpaymentStatus;
  const confirmed = status === "confirmed" || status === "legacy_confirmed";
  const typed = reference.trim() || null;
  return {
    ...invoiceParts(invoice),
    orderId: order.id,
    orderReference: orderReference(order.id),
    paymentReference: typed,
    paidInFull:
      invoicePaidInFull(invoice) ||
      order.paymentPlan?.balanceMinor === 0 ||
      order.paymentPlan?.downpaymentPercent === FULL_PAYMENT_PERCENT,
    paymentStatus: confirmed ? "confirmed" : typed ? "checking" : "none",
  };
}

/**
 * The slip checkout printed, kept for the receipt screen that opens next.
 *
 * One value, matched by order id, never cleared on read: a StrictMode double
 * mount reads it twice, and the screen's own reads replace it a moment later.
 */
let placedReceipt: ReceiptView | null = null;

export function holdPlacedReceipt(view: ReceiptView | null): void {
  placedReceipt = view;
}

export function placedReceiptFor(orderId: string | null | undefined): ReceiptView | null {
  return orderId && placedReceipt?.orderId === orderId ? placedReceipt : null;
}

/**
 * The one line under the total that says where the money stands.
 *
 * Never "paid" until Operations has confirmed the reference: submitting one
 * is not paying, and the client sits in "being checked" for real.
 */
export function receiptPaymentLine(
  view: Pick<ReceiptView, "paidInFull" | "paymentStatus">,
): string | null {
  if (view.paymentStatus === "none") return null;
  if (view.paymentStatus === "confirmed") {
    return view.paidInFull ? "Paid in full by QR" : "Downpayment paid by QR";
  }
  return view.paidInFull
    ? "Sent in full by QR. GRIDGO is checking it."
    : "Downpayment sent by QR. GRIDGO is checking it.";
}

/** "24 Sep 2026, 9:00 AM" in Davao time, whatever zone the phone is in. */
export function receiptDateLabel(at: string | null | undefined): string | null {
  if (!at) return null;
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Qty 100" — the count on one slip line. */
export function receiptQuantityLabel(quantity: number): string {
  return `Qty ${quantity.toLocaleString("en-PH")}`;
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
  const printing = printingMinor(order.subtotalMinor, serviceFeeMinor);
  return {
    invoiceNumber: order.invoiceNumber ?? "",
    orderId: order.id,
    orderReference: orderReference(order.id),
    issuedAt: order.createdAt,
    lines: order.title
      ? [{ id: order.id, name: order.title, quantity: order.quantity, amountLabel: formatPhp(printing) }]
      : [],
    money: {
      printingMinor: printing,
      deliveryFeeMinor: order.deliveryFeeMinor ?? 0,
      serviceFeeMinor,
      serviceFeeRateBps,
      totalMinor: order.totalMinor,
    },
    paymentReference: paymentReferenceOf(order.payments),
    paidInFull: paysInFull(order),
    paymentStatus: paymentStatusOf(order.payments),
  };
}

export function receiptShowsFee(money: Pick<ReceiptMoney, "serviceFeeMinor" | "serviceFeeRateBps">): boolean {
  return showsServiceFee(money);
}
