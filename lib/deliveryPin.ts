/**
 * The delivery pin: will the client be there when the order leaves the shop,
 * and the one change they may make before a rider is assigned.
 *
 * Contract: gridgo-api `docs/DELIVERY_PIN_API.md` (report 6C8DE953). The
 * server owns every rule here — `canConfirm`, `canChange`, the zone, the fee
 * difference — and this module only decides what the client reads and which
 * one thing is offered. Three things are easy to say wrongly:
 *
 * - **Confirming is not changing.** "Yes, I'll be here" uses nothing; only a
 *   saved new pin uses the one change.
 * - **A dearer pin is not saved until Operations confirms the payment.** Until
 *   then the rider keeps the original pin, and nothing may read as changed.
 * - **A cheaper pin is a credit, not a cancellation.** The difference is
 *   returned through the refund flow by hand; the order carries on.
 *
 * There is no service-area limit beyond Out of Zone: never invent one.
 */

import type { DeliveryPin, DeliveryPinChange, Order, PlatformSettings } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import type { OrderNextAction } from "@/lib/orderState";

export const PIN_LABEL_MAX = 240;
export const PIN_NOTES_MAX = 500;
export const PIN_RECEIVER_MAX = 120;

/** The states in which the pin may still change (the server's `deliveryPinLocked`). */
const BEFORE_DISPATCH = ["production", "supplier_self_qc", "ready_for_dispatch"];

const ZONE_FALLBACK: Record<string, string> = {
  nearby: "Nearby",
  away: "Away",
  long_distance: "Long Distance",
  out_of_zone: "Out of Zone",
};

/** "Nearby", from the same bands that price delivery. */
export function pinZoneLabel(
  zone: string | null | undefined,
  settings?: Pick<PlatformSettings, "deliveryFeeBands"> | null,
): string | null {
  if (!zone) return null;
  const band = settings?.deliveryFeeBands?.find((row) => row.zone === zone);
  return band?.label || ZONE_FALLBACK[zone] || null;
}

export type DeliveryPinView =
  /** Production finished and nobody has said they will be there yet. */
  | { kind: "ask"; pin: DeliveryPin; lapsed: DeliveryPinChange | null }
  /** A dearer pin waits for its QR payment; the original is still in use. */
  | { kind: "pay"; pin: DeliveryPin; change: DeliveryPinChange }
  /** The payment is with Operations. Nothing to do. */
  | { kind: "checking"; pin: DeliveryPin; change: DeliveryPinChange }
  /** Confirmed, changed, or simply in use. */
  | { kind: "set"; pin: DeliveryPin; lapsed: DeliveryPinChange | null };

/**
 * Which one face the pin shows. A proposal that was never paid for is dropped
 * from the ask once a rider is assigned (the window closed on it), or once the
 * client said they will be at the original pin after proposing it.
 */
export function deliveryPinView(order: Pick<Order, "deliveryPin" | "fulfillmentMode">): DeliveryPinView | null {
  const pin = order.deliveryPin;
  if (!pin || order.fulfillmentMode === "pickup") return null;
  const change = pin.change ?? null;
  if (change?.status === "pending_confirmation") return { kind: "checking", pin, change };
  let lapsed: DeliveryPinChange | null = null;
  if (change?.status === "pending_payment") {
    const keptOriginal =
      pin.status === "confirmed" && pin.confirmedAt != null && pin.confirmedAt > change.createdAt;
    if (pin.canChange && !keptOriginal) return { kind: "pay", pin, change };
    lapsed = change;
  }
  if (pin.status === "pending" && pin.canConfirm) return { kind: "ask", pin, lapsed };
  return { kind: "set", pin, lapsed };
}

/** True while the pin asks something of the client: Home's docket and the order's yellow. */
export function deliveryPinNeedsClient(order: Pick<Order, "deliveryPin" | "fulfillmentMode">): boolean {
  const view = deliveryPinView(order);
  return view?.kind === "ask" || view?.kind === "pay";
}

/** What the fee difference means, in one line. */
export function feeDifferenceLine(differenceMinor: number): string {
  if (differenceMinor > 0) return `${formatPhp(differenceMinor)} more to deliver here`;
  if (differenceMinor < 0) return `${formatPhp(-differenceMinor)} back to you`;
  return "Same delivery fee";
}

/** What saving this pin will do, said before the client commits to it. */
export function feeDifferenceDetail(differenceMinor: number): string {
  if (differenceMinor > 0) {
    return `Pay the ${formatPhp(differenceMinor)} difference by QR. Your new pin is saved once Operations confirms the payment; until then your rider keeps the original pin.`;
  }
  if (differenceMinor < 0) {
    return `The new pin is saved straight away. GRIDGO sends the ${formatPhp(-differenceMinor)} difference back to your own wallet as a delivery-fee credit, and your order carries on as normal.`;
  }
  return "The new pin is saved straight away. Nothing more to pay.";
}

/** The warning the change route insists on (`acknowledgeOneChange`). */
export const ONE_CHANGE_WARNING =
  "This is your one pin change. Once it is saved you cannot move the pin again, and changes close when a rider is assigned.";

/** The line under the pin about the change allowance. */
export function changeAllowanceLine(pin: DeliveryPin, view: DeliveryPinView): string {
  if (pin.changeUsed) return "You have used your one pin change.";
  if (view.kind === "pay") return "Your pin change is not saved until the payment is confirmed.";
  if (view.kind === "checking") return "Your pin change is saved once Operations confirms the payment.";
  if (pin.canChange) return "You can change this pin once, until a rider is assigned.";
  return "A rider is assigned, so the pin can no longer change. Message GRIDGO if it is wrong.";
}

/** Who meets the rider. */
export function receiverLine(pin: Pick<DeliveryPin, "receiverName">): string {
  const name = pin.receiverName.trim();
  return name ? `${name} receives it` : "You receive it";
}

/** The applied change, as the money card and the pin card both say it. */
export function appliedChangeLine(change: DeliveryPinChange | null | undefined): string | null {
  if (change?.status !== "applied") return null;
  if (change.feeDifferenceMinor > 0) return `Pin change · ${formatPhp(change.feeDifferenceMinor)} paid by QR`;
  if (change.feeDifferenceMinor < 0) {
    return `Pin change · ${formatPhp(-change.feeDifferenceMinor)} delivery-fee credit`;
  }
  return "Pin change · same delivery fee";
}

/** Home's docket verb, keyed to the action (see `OrderNextAction`). */
export function deliveryPinNextAction(order: Pick<Order, "deliveryPin" | "fulfillmentMode">): OrderNextAction | null {
  const view = deliveryPinView(order);
  if (view?.kind === "ask") {
    return {
      title: "Confirm your delivery pin",
      body: view.pin.canChange
        ? "Production is finished. Say you will be at the pin, or change it once before a rider is assigned."
        : "Your rider is on the way to this pin. Say you will be there to receive it.",
      tone: "warning",
      icon: "map-pin",
    };
  }
  if (view?.kind === "pay") {
    return {
      title: `Pay ${formatPhp(view.change.feeDifferenceMinor)} for your new pin`,
      body: "Your new pin costs more to deliver to. Until Operations confirms the payment, your rider keeps the original pin.",
      tone: "warning",
      icon: "wallet",
    };
  }
  return null;
}

/** Whether a rider has not been sent yet, so a pin change could still be made. */
export function beforeDispatch(state: string): boolean {
  return BEFORE_DISPATCH.includes(state);
}

/**
 * `delivery_pin_*` inbox rows, in the client's words. gridgo-api writes one
 * body for the client, the rider and Operations ("The client confirmed…"), so
 * the client copy always comes from here.
 */
export function deliveryPinNotificationCopy(type: string | null | undefined): { title: string; body: string } | null {
  switch (type) {
    case "delivery_pin_requested":
      return {
        title: "Will you be at your delivery pin?",
        body: "Production is finished. Say you will be there, or change the pin once before a rider is assigned.",
      };
    case "delivery_pin_confirmed":
      return { title: "Delivery pin confirmed", body: "You confirmed who will be there to receive it. Your rider gets the pin with your notes." };
    case "delivery_pin_proposed":
      return {
        title: "Pay to save your new pin",
        body: "Your new pin costs more to deliver to. Until Operations confirms the payment, your rider keeps the original pin.",
      };
    case "delivery_pin_payment_submitted":
      return {
        title: "Checking your pin payment",
        body: "Operations is matching your transfer. Your original pin stays in use until they confirm it.",
      };
    case "delivery_pin_payment_rejected":
      return {
        title: "Pin payment not confirmed",
        body: "Operations could not match your transfer, so your original pin is still in use. Open the order for their reason.",
      };
    case "delivery_pin_changed":
      return {
        title: "Delivery pin changed",
        body: "Your rider goes to your new pin. Open the order for any delivery-fee credit.",
      };
    default:
      return null;
  }
}

/** Rows that ask something, while the order has not left the shop. */
export const DELIVERY_PIN_ASK_TYPES = [
  "delivery_pin_requested",
  "delivery_pin_proposed",
  "delivery_pin_payment_rejected",
] as const;

export function isDeliveryPinAsk(type: string | null | undefined): boolean {
  return (DELIVERY_PIN_ASK_TYPES as readonly string[]).includes(type ?? "");
}
