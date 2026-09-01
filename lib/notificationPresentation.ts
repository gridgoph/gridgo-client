import type { Notification } from "@/lib/api";
import { GRIDGO_OFFICE_LABEL } from "@/lib/gridgoOffice";
import {
  fulfilmentRailKind,
  orderStageIndex,
  type FulfilmentRailKind,
} from "@/lib/orderStages";

/**
 * How one inbox row should read, independent of how the server first worded it.
 *
 * Collect jobs used to reuse delivery titles ("Out for delivery") and the
 * door-shaped rail. The list payload now carries fulfillmentMode; this module
 * turns that into a counter docket vs a door slip so a pickup is unmistakable.
 */

export type NotificationLane = "need_you" | "update";

export type PresentedNotification = {
  stamp: string | null;
  title: string;
  body: string;
  jobLine: string | null;
  railKind: FulfilmentRailKind | null;
  stageIndex: number | null;
  collectHold: boolean;
  collectReady: boolean;
  lane: NotificationLane;
  hint: string | null;
};

const NEED_YOU_TYPES = new Set([
  "order_client_correction",
  "order_proof_approval",
  "supplier_assignment_final_price",
  "order_ready_for_pickup",
]);

function isCollect(notification: Notification): boolean {
  return (
    notification.fulfillmentMode === "pickup" ||
    notification.type === "order_ready_for_pickup"
  );
}

function collectionHeld(notification: Notification): boolean {
  if (notification.collectHold === true) return true;
  if (notification.collectHold === false) return false;
  return (
    isCollect(notification) &&
    notification.orderState === "awaiting_collection" &&
    /settle the remaining balance/i.test(notification.body)
  );
}

function collectCopy(
  notification: Notification,
  hold: boolean,
): { title: string; body: string; hint: string | null } {
  switch (notification.orderState) {
    case "ready_for_dispatch":
      return {
        title: "Packed for the office",
        body: `This job is packed. A GRIDGO rider will bring it to the ${GRIDGO_OFFICE_LABEL} counter.`,
        hint: "Opens this job",
      };
    case "rider_assigned":
      return {
        title: "A rider is collecting it",
        body: "A GRIDGO rider is picking this up from the shop to bring it to the office.",
        hint: "Opens this job",
      };
    case "picked_up":
    case "out_for_delivery":
      return {
        title: "On the way to GRIDGO Office",
        body: `The rider has your order and is bringing it to the ${GRIDGO_OFFICE_LABEL} counter. We'll tell you when you can collect it.`,
        hint: "Opens this job",
      };
    case "awaiting_collection":
      return hold
        ? {
            title: "Settle, then collect",
            body: `Your order is waiting at ${GRIDGO_OFFICE_LABEL}. Settle the remaining balance in the app before you travel — the counter releases it once Operations confirms payment.`,
            hint: "Open to pay",
          }
        : {
            title: "Waiting at the counter",
            body: `Your order is at ${GRIDGO_OFFICE_LABEL}. Come to the counter and give the name you ordered under.`,
            hint: "Open for the address",
          };
    case "delivered":
    case "issue_window_open":
      return {
        title: "Collected",
        body:
          notification.orderState === "issue_window_open"
            ? "This order was collected at the GRIDGO Office counter. You have a short window to raise an issue if something is wrong."
            : "This order was collected at the GRIDGO Office counter.",
        hint: "Opens this job",
      };
    default:
      return {
        title: notification.title,
        body: notification.body,
        hint: notification.orderId ? "Opens this job" : null,
      };
  }
}

function collectStamp(state: string | undefined, hold: boolean): string {
  if (hold) return "COLLECT · PAY FIRST";
  if (state === "awaiting_collection") return "COLLECT AT THE COUNTER";
  if (state === "delivered" || state === "issue_window_open" || state === "completed") {
    return "COLLECTED";
  }
  return "COLLECT AT GRIDGO OFFICE";
}

function deliveryStamp(state: string | undefined): string | null {
  if (!state) return null;
  if (state === "out_for_delivery" || state === "picked_up" || state === "rider_assigned") {
    return "ON THE WAY TO YOU";
  }
  if (state === "delivered" || state === "issue_window_open") return "AT YOUR DOOR";
  if (state === "ready_for_dispatch") return "TO YOUR DOOR";
  return null;
}

export function presentNotification(notification: Notification): PresentedNotification {
  const collect = isCollect(notification);
  const hold = collectionHeld(notification);
  const overlay = collect
    ? collectCopy(notification, hold)
    : {
        title: notification.title,
        body: notification.body,
        hint: notification.orderId ? "Opens this job" : null,
      };
  const collectReady =
    collect && notification.orderState === "awaiting_collection" && !hold;
  const needsYou =
    hold ||
    collectReady ||
    (notification.type != null && NEED_YOU_TYPES.has(notification.type));

  const railKind = notification.orderState
    ? fulfilmentRailKind(collect ? "pickup" : notification.fulfillmentMode)
    : null;

  return {
    stamp: collect
      ? collectStamp(notification.orderState, hold)
      : deliveryStamp(notification.orderState),
    title: overlay.title,
    body: overlay.body,
    jobLine: notification.orderTitle?.trim() || null,
    railKind,
    stageIndex: orderStageIndex(notification.orderState, collect ? "pickup" : notification.fulfillmentMode),
    collectHold: hold,
    collectReady,
    lane: needsYou ? "need_you" : "update",
    hint: overlay.hint,
  };
}

export function partitionInbox(items: Notification[]): {
  needYou: Notification[];
  updates: Notification[];
} {
  const needYou: Notification[] = [];
  const updates: Notification[] = [];
  for (const item of items) {
    if (presentNotification(item).lane === "need_you") needYou.push(item);
    else updates.push(item);
  }
  return { needYou, updates };
}
