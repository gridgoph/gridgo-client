/**
 * When the shop on an order cannot take it or finish it.
 *
 * Contract: `docs/SHOP_RECOVERY_API.md` in gridgo-api (gridgoph/gridgo-supplier#102).
 * A shop that lets its one opening hour to accept run out, declines, or
 * cancels before the rider picks up stops the order. GRIDGO looks for another
 * vetted shop for the same item, specs and price, and the client makes one
 * decision: take that shop and its new ready date, or a full refund. Nothing
 * changes hands until they choose, and a changed offer is shown again rather
 * than accepted for them.
 *
 * The client is never told which shop, why it failed, or at what stage —
 * only that it could not take the order, and what happens next.
 */

import type { Notification, Order, ShopRecovery } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import type { OrderNextAction } from "@/lib/orderState";
import { confirmedPaidMinor } from "@/lib/refunds";

export const SHOP_RECOVERY_HEADLINE = "Your shop could not take this order";
export const SHOP_RECOVERY_NOTIFICATION_TYPE = "shop_recovery";

export type ShopRecoveryView =
  /** A replacement is on offer: accept it, or a full refund. */
  | { kind: "offer"; recovery: ShopRecovery; promiseBy: string }
  /** Nothing compatible is free: the refund is the one way forward. */
  | { kind: "no_match"; recovery: ShopRecovery }
  /** Operations has to sort it out; the refund stays available. */
  | { kind: "operations"; recovery: ShopRecovery };

/**
 * What the order screen draws for the shop's failure, or null when there is
 * nothing to decide: no failure, the replacement already accepted, or a refund
 * already chosen (the refund card then speaks for the order).
 */
export function shopRecoveryView(order: Pick<Order, "shopRecovery">): ShopRecoveryView | null {
  const recovery = order.shopRecovery;
  if (!recovery) return null;
  if (recovery.status === "awaiting_client") {
    if (recovery.canAccept && recovery.replacement?.promiseBy) {
      return { kind: "offer", recovery, promiseBy: recovery.replacement.promiseBy };
    }
    return { kind: "no_match", recovery };
  }
  if (recovery.status === "ops_review") return { kind: "operations", recovery };
  return null;
}

/** The order is stopped until the client or Operations decides. */
export function shopRecoveryPending(order: Pick<Order, "shopRecovery">): boolean {
  return shopRecoveryView(order) != null;
}

/** What a full refund means on this order, said before they choose it. */
export function shopRecoveryRefundNote(order: Pick<Order, "payments">): string {
  const paid = confirmedPaidMinor(order);
  return paid > 0
    ? `All ${formatPhp(paid)} you paid comes back. Operations sends it to your receiving QR.`
    : "You have not paid for this yet, so the order is cancelled and nothing is charged.";
}

export const SHOP_RECOVERY_ACCEPT_NOTE =
  "Same item, same specs, same price. The new shop confirms within an hour of their opening time, then printing starts.";

/** Home's docket and the order screen's one action. */
export function shopRecoveryNextAction(order: Pick<Order, "shopRecovery">): OrderNextAction | null {
  const view = shopRecoveryView(order);
  if (!view || view.kind === "operations") return null;
  return view.kind === "offer"
    ? {
        title: "Choose the new shop or a refund",
        body: "Your shop could not take this order. GRIDGO found another one for the same item and price.",
        tone: "info",
        icon: "square-pen",
      }
    : {
        title: "Choose a full refund",
        body: "Your shop could not take this order, and no other shop can print it exactly as ordered right now.",
        tone: "info",
        icon: "square-pen",
      };
}

/** The wait line while Operations has it. */
export function shopRecoveryWaitingOn(order: Pick<Order, "shopRecovery">): string | null {
  return shopRecoveryView(order)?.kind === "operations"
    ? "Your shop could not take this order. Operations will contact you about what happens next."
    : null;
}

/**
 * One inbox row about the shop's failure, in the client's words.
 *
 * gridgo-api writes every `shop_recovery` row for the client, the shop and
 * Operations alike, so some of its bodies are about "the client". The row's
 * own wording says which step it was, and that is all this reads.
 */
export function shopRecoveryNotificationCopy(
  notification: Pick<Notification, "type" | "body">,
): { title: string; body: string } | null {
  if (notification.type !== SHOP_RECOVERY_NOTIFICATION_TYPE) return null;
  const body = notification.body ?? "";
  if (/accepted a replacement/i.test(body)) {
    return {
      title: "New shop on your order",
      body: "You accepted the new shop. They confirm within an hour of their opening time.",
    };
  }
  if (/full refund/i.test(body) && /chose/i.test(body)) {
    return {
      title: "Full refund requested",
      body: "Operations reviews it and sends what you paid to your receiving QR.",
    };
  }
  if (/reviewing/i.test(body)) {
    return { title: SHOP_RECOVERY_HEADLINE, body: "Operations will contact you about what happens next." };
  }
  if (/no replacement/i.test(body)) {
    return { title: SHOP_RECOVERY_HEADLINE, body: "No other shop can print it as ordered. You can choose a full refund." };
  }
  return {
    title: SHOP_RECOVERY_HEADLINE,
    body: "GRIDGO found another shop for the same item and price. Open the order to accept it or choose a full refund.",
  };
}

/** Whether the row still asks the client to choose. */
export function shopRecoveryNotificationNeedsYou(notification: Pick<Notification, "type" | "body">): boolean {
  if (notification.type !== SHOP_RECOVERY_NOTIFICATION_TYPE) return false;
  return !/accepted a replacement|chose a full refund|reviewing/i.test(notification.body ?? "");
}
