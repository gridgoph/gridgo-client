/**
 * The delivery acknowledgement receipt (gridgo-rider#152, gridgo-api
 * `docs/ACKNOWLEDGEMENT_RECEIPTS_API.md`).
 *
 * During the pilot a door delivery comes with a paper acknowledgement receipt
 * the rider hands over and both sides sign. GRIDGO issues the same receipt
 * from the order — one number in one running AR series — and the client reads
 * and keeps it here. It is never an official receipt: the app says so, and
 * always shows GRIDGO's own note.
 *
 * Every figure is drawn as GRIDGO froze it. A line's subtotal is the stored
 * one, never unit price × quantity; a missing unit price is "Not recorded".
 */

import * as api from "@/lib/api";
import type { AcknowledgementReceipt, AcknowledgementReceiptPayment, Order } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { refusalCode, saveSignedInFile } from "@/lib/fileSave";
import { isJobComplete } from "@/lib/jobComplete";

export const ACK_RECEIPT_TITLE = "Acknowledgement receipt";
export const ACK_RECEIPT_ROUTE = "/order/acknowledgement-receipt";
export const ACK_RECEIPT_NOTIFICATION_TYPE = "acknowledgement_receipt_ready";

/** Said beside the receipt, so nobody files it as tax paper. */
export const NOT_OFFICIAL_RECEIPT = "This is not an official receipt.";
export const NOT_RECORDED = "Not recorded";

export function acknowledgementReceiptHref(orderId: string): string {
  return `${ACK_RECEIPT_ROUTE}?orderId=${encodeURIComponent(orderId)}`;
}

/** The states in which the rider has the order on the way to the client's door. */
const AT_DOOR_STATES = new Set(["picked_up", "out_for_delivery"]);
const DELIVERED_STATES = new Set(["delivered", "issue_window_open"]);

/**
 * Where an order stands as far as its receipt goes. Only a door delivery ever
 * gets one; a hub pick-up's rider takes the job to GRIDGO's counter, not to
 * the client.
 */
export type ReceiptStage = "pickup" | "before_door" | "at_door" | "delivered" | "cancelled";

export function receiptStage(order: Pick<Order, "fulfillmentMode" | "state">): ReceiptStage {
  if (order.fulfillmentMode === "pickup") return "pickup";
  if (order.state === "cancelled") return "cancelled";
  if (AT_DOOR_STATES.has(order.state)) return "at_door";
  if (DELIVERED_STATES.has(order.state) || isJobComplete(order.state)) return "delivered";
  return "before_door";
}

/**
 * Whether the order screen reads the receipt at all. A door order from the
 * moment it leaves the shop, and a cancelled one (a receipt issued at the door
 * stays issued if the handover then failed). Nothing earlier, so an order
 * still on the press never costs the read.
 */
export function readsAcknowledgementReceipt(order: Pick<Order, "fulfillmentMode" | "state">): boolean {
  const stage = receiptStage(order);
  return stage === "at_door" || stage === "delivered" || stage === "cancelled";
}

/**
 * Why there is no receipt, in the client's words. There is no backfill, so an
 * order delivered before receipts began says so plainly rather than "not yet".
 */
export function receiptAbsence(order: Pick<Order, "fulfillmentMode" | "state">): { title: string; body: string } {
  switch (receiptStage(order)) {
    case "pickup":
      return {
        title: "No acknowledgement receipt for pick-up",
        body: "GRIDGO issues acknowledgement receipts for orders delivered to your door. You collect this order at GRIDGO Office, so it does not get one. Your order receipt from checkout still lists what you paid.",
      };
    case "delivered":
      return {
        title: "Delivered before receipts began",
        body: "This order was delivered before GRIDGO started issuing acknowledgement receipts, so it does not have one. Your order receipt from checkout still lists what you paid.",
      };
    case "at_door":
      return {
        title: "Not issued yet",
        body: "Your rider prepares the acknowledgement receipt at your door, before you sign for the order. It appears here as soon as it is issued.",
      };
    case "cancelled":
      return {
        title: "No acknowledgement receipt",
        body: "GRIDGO did not issue an acknowledgement receipt for this order.",
      };
    default:
      return {
        title: "Not issued yet",
        body: "GRIDGO issues the acknowledgement receipt when your order reaches your door. It appears here then.",
      };
  }
}

/** The order-screen line for a receipt that exists: "AR-0000000001 · 21 Oct 2026, 9:00 AM". */
export function receiptSummaryLine(receipt: Pick<AcknowledgementReceipt, "arNumber" | "issuedAt">): string {
  return `${receipt.arNumber} · ${issuedStamp(receipt.issuedAt)}`;
}

/** When the receipt was issued, in Davao time: "21 Oct 2026, 9:00 AM". */
export function issuedStamp(at: string | null | undefined): string {
  const date = new Date(at ?? "");
  if (Number.isNaN(date.getTime())) return NOT_RECORDED;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}

/**
 * A line's quantity and unit rate under its description. A unit rate is
 * indicative — quantity pricing can make it disagree with the subtotal — so it
 * is labelled as a rate and never multiplied out.
 */
export function lineDetail(line: Pick<api.AcknowledgementReceiptLine, "quantity" | "unitPriceMinor">): string {
  const rate = line.unitPriceMinor == null ? `Unit rate ${NOT_RECORDED.toLowerCase()}` : `${formatPhp(line.unitPriceMinor)} each`;
  return `Qty ${line.quantity.toLocaleString("en-PH")} · ${rate}`;
}

/** "−₱50.00": a deduction, drawn as one. */
export function deduction(amountMinor: number): string {
  return `−${formatPhp(Math.abs(amountMinor))}`;
}

/** A signed adjustment: "+₱0.01" or "−₱0.01". */
export function signedAmount(amountMinor: number): string {
  return amountMinor < 0 ? deduction(amountMinor) : `+${formatPhp(amountMinor)}`;
}

/**
 * The rows between the lines and the grand total. Discounts and the rounding
 * adjustment appear only when they are not zero; delivery is always there.
 */
export function receiptAdjustments(
  receipt: Pick<
    AcknowledgementReceipt,
    "deliveryFeeMinor" | "organizationDiscountMinor" | "voucherDiscountMinor" | "roundingAdjustmentMinor"
  >,
): { label: string; value: string }[] {
  const rows = [{ label: "Delivery fee", value: formatPhp(receipt.deliveryFeeMinor) }];
  if (receipt.organizationDiscountMinor) {
    rows.push({ label: "Organization discount", value: deduction(receipt.organizationDiscountMinor) });
  }
  if (receipt.voucherDiscountMinor) {
    rows.push({ label: "Voucher discount", value: deduction(receipt.voucherDiscountMinor) });
  }
  if (receipt.roundingAdjustmentMinor) {
    rows.push({ label: "Rounding adjustment", value: signedAmount(receipt.roundingAdjustmentMinor) });
  }
  return rows;
}

/**
 * The payment type as recorded. A manual QR payment does not prove which
 * wallet paid it, so it is never called GCash, Maya or QR Ph.
 */
const METHOD_LABELS: Record<string, string> = {
  qr_manual: "QR payment",
  gcash: "GCash",
  maya: "Maya",
  bank_transfer: "Bank transfer",
  qr_ph: "QR Ph",
  cash: "Cash",
};

const TYPE_LABELS: Record<string, string> = { digital: "Digital", cash: "Cash" };

export function paymentTypeLabel(payment: Pick<AcknowledgementReceiptPayment, "type" | "method">): string {
  const type = TYPE_LABELS[payment.type] ?? null;
  const method = payment.method ? (METHOD_LABELS[payment.method] ?? null) : null;
  if (type && method && method !== type) return `${type} · ${method}`;
  return method ?? type ?? NOT_RECORDED;
}

/** "Payment", or "Payment 1 of 2" when the checkout was paid in parts. */
export function paymentHeading(index: number, count: number): string {
  return count > 1 ? `Payment ${index + 1} of ${count}` : "Payment";
}

/** The rows for one recorded payment. Received and change only ever for recorded cash. */
export function paymentRows(payment: AcknowledgementReceiptPayment): { label: string; value: string }[] {
  const rows = [
    { label: "Amount", value: formatPhp(payment.amountMinor) },
    { label: "Payment type", value: paymentTypeLabel(payment) },
    { label: "Reference", value: payment.reference?.trim() || NOT_RECORDED },
  ];
  if (payment.type === "cash") {
    rows.push(
      {
        label: "Amount received",
        value: payment.amountReceivedMinor == null ? NOT_RECORDED : formatPhp(payment.amountReceivedMinor),
      },
      { label: "Change", value: payment.changeMinor == null ? NOT_RECORDED : formatPhp(payment.changeMinor) },
    );
  }
  return rows;
}

/** Why a read failed, for a screen that has no receipt to draw. */
export function receiptReadError(error: unknown): { title: string; body: string } {
  if (error instanceof api.ApiError) {
    if (error.message === "order_not_found") {
      return { title: "Order not found", body: "GRIDGO could not find this order. Open Orders and pick it again." };
    }
    if (error.status === 403 || error.message === "forbidden") {
      return {
        title: "Not your receipt",
        body: "Only the account that placed this order can see its acknowledgement receipt.",
      };
    }
    if (error.status === 401) {
      return { title: "Signed out", body: "Your session expired. Sign in again to see this receipt." };
    }
  }
  return {
    title: "Receipt did not load",
    body: "GRIDGO could not load this acknowledgement receipt. Check your connection and try again.",
  };
}

export type DownloadResult = { ok: true; message: string | null } | { ok: false; message: string };

export const RECEIPT_DOWNLOAD_NEEDS_REBUILD = "Saving the receipt needs a rebuilt GRIDGO app on this phone.";

function refusedMessage(status: number, body: string): string {
  const code = refusalCode(body);
  if (code === "acknowledgement_receipt_not_found") return "GRIDGO has not issued an acknowledgement receipt for this order.";
  if (status === 401) return "Your session expired. Sign in again, then download.";
  if (status === 403 || code === "forbidden") {
    return "This receipt can only be downloaded by the account that placed the order.";
  }
  return "GRIDGO could not prepare the receipt PDF. Try again in a moment.";
}

/** Keeps the receipt PDF the way this phone keeps any signed-in file. */
export async function downloadAcknowledgementReceipt(
  receipt: Pick<AcknowledgementReceipt, "orderId" | "arNumber">,
): Promise<DownloadResult> {
  try {
    const outcome = await saveSignedInFile(
      await api.acknowledgementReceiptDownloadRequest(receipt.orderId),
      `${receipt.arNumber}.pdf`,
      "application/pdf",
    );
    if (outcome.kind === "unavailable") return { ok: false, message: RECEIPT_DOWNLOAD_NEEDS_REBUILD };
    if (outcome.kind === "refused") return { ok: false, message: refusedMessage(outcome.status, outcome.body) };
    return { ok: true, message: outcome.message };
  } catch {
    return { ok: false, message: "GRIDGO could not prepare the receipt PDF. Check your connection and try again." };
  }
}
