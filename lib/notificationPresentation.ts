import { formatPhp, type Notification } from "@/lib/api";
import { GRIDGO_OFFICE_LABEL } from "@/lib/gridgoOffice";
import { isJobComplete } from "@/lib/jobComplete";
import { orderReference } from "@/lib/orderReference";
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
  /** "3FF0-128E-105A" — the job's reference, when the update is about one job. */
  reference: string | null;
  railKind: FulfilmentRailKind | null;
  stageIndex: number | null;
  collectHold: boolean;
  collectReady: boolean;
  lane: NotificationLane;
  hint: string | null;
  paymentLine: string | null;
};

const NEED_YOU_TYPES = new Set([
  "order_client_correction",
  "order_proof_approval",
  "supplier_assignment_final_price",
  "order_ready_for_pickup",
  "order_rate_reminder",
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

/**
 * The inbox row for the platform closing a job.
 *
 * The server words this "Completed / This order is complete", which is the
 * state name read aloud. The row is the client's first sight of the ending,
 * so it says what the ending was: it arrived, the window passed, you are done.
 * The order screen carries the fuller record (`JobCompleteCard`).
 */
function completeCopy(collect: boolean): { title: string; body: string; hint: string } {
  return {
    title: "Job complete",
    body: collect
      ? `Your order was collected at ${GRIDGO_OFFICE_LABEL} and the check window has closed. This job is closed, and nothing more is needed from you.`
      : "Your order was delivered and the check window has closed. This job is closed, and nothing more is needed from you.",
    hint: "Opens this job",
  };
}

function collectStamp(state: string | undefined, hold: boolean): string {
  if (hold) return "COLLECT · PAY FIRST";
  if (isJobComplete(state)) return "JOB COMPLETE";
  if (state === "awaiting_collection") return "COLLECT AT THE COUNTER";
  if (state === "delivered" || state === "issue_window_open") return "COLLECTED";
  return "COLLECT AT GRIDGO OFFICE";
}

function deliveryStamp(state: string | undefined): string | null {
  if (!state) return null;
  if (isJobComplete(state)) return "JOB COMPLETE";
  if (state === "out_for_delivery" || state === "picked_up" || state === "rider_assigned") {
    return "ON THE WAY TO YOU";
  }
  if (state === "delivered" || state === "issue_window_open") return "AT YOUR DOOR";
  if (state === "ready_for_dispatch") return "TO YOUR DOOR";
  return null;
}

function rateReminderCopy(): { title: string; body: string; hint: string } {
  return {
    title: "How did it go?",
    body: "Rate this job so GRIDGO can send your next one to a shop that did well by you. Open the order — the prompt sits under the summary.",
    hint: "Open to rate",
  };
}

function receiptReadyCopy(): { title: string; body: string; hint: string } {
  return {
    title: "Your receipt is ready",
    body: "Open the receipt to see printing, delivery, the service fee, the total and your payment reference.",
    hint: "Opens the receipt",
  };
}

export function presentNotification(notification: Notification): PresentedNotification {
  const eventState = notification.eventState ?? notification.orderState;
  const event = notification.eventState ? { ...notification, orderState: eventState } : notification;
  const payment = notification.paymentAction;
  const paymentLine = payment && payment.amountMinor > 0
    ? payment.status === "due"
      ? `Now: final payment ${formatPhp(payment.amountMinor)} due. Open the order for the QR and receipt upload.`
      : `Now: final payment ${formatPhp(payment.amountMinor)} is being checked. Do not pay again.`
    : null;
  const collect = isCollect(notification);
  const hold = collectionHeld(notification);
  const overlay =
    notification.type === "order_rate_reminder"
      ? rateReminderCopy()
      : notification.type === "order_receipt_ready"
        ? receiptReadyCopy()
        : isJobComplete(eventState)
          ? completeCopy(collect)
          : collect
            ? collectCopy(event, hold && eventState === notification.orderState)
            : {
                title: notification.title,
                body: notification.body,
                hint: notification.orderId ? "Opens this job" : null,
              };
  const collectReady =
    collect && notification.orderState === "awaiting_collection" && !hold;
  const needsYou =
    payment?.status === "due" ||
    hold ||
    collectReady ||
    (notification.type != null && NEED_YOU_TYPES.has(notification.type));

  const railKind = eventState
    ? fulfilmentRailKind(collect ? "pickup" : notification.fulfillmentMode)
    : null;

  return {
    stamp: collect
      ? collectStamp(eventState, hold && eventState === notification.orderState)
      : deliveryStamp(eventState),
    title: overlay.title,
    body: overlay.body,
    jobLine: notification.orderTitle?.trim() || null,
    reference: orderReference(notification.orderId),
    railKind,
    stageIndex: orderStageIndex(eventState, collect ? "pickup" : notification.fulfillmentMode),
    collectHold: hold,
    collectReady,
    lane: needsYou ? "need_you" : "update",
    hint: paymentLine ? "Opens current payment details" : overlay.hint,
    paymentLine,
  };
}

/**
 * Every row the inbox holds about one job, drawn as one card.
 *
 * The API writes a durable row per order step, and each row carries the job's
 * *current* payment line, reference and rail. Drawn one card per row, one job
 * filled the screen with near-identical cards repeating the same "Now:" line.
 * So rows sharing an `orderId` fold into one group: the newest row speaks for
 * the job and the rest are its history. A row with no job stays on its own.
 * The rows themselves are untouched — they are the record of what the client
 * was told and when, and read state stays per row on the server.
 */
export type NotificationGroup = {
  /** Stable React key: the job, or the lone row. */
  key: string;
  orderId: string | null;
  /** The newest row. Its copy, rail and lane are the card's. */
  latest: Notification;
  /** Every row in the group, newest first — `items[0]` is `latest`. */
  items: Notification[];
};

function newestFirst(items: Notification[]): Notification[] {
  return items
    .map((item, index) => ({ item, index, time: Date.parse(item.at) }))
    .sort((a, b) => {
      const ta = Number.isFinite(a.time) ? a.time : -Infinity;
      const tb = Number.isFinite(b.time) ? b.time : -Infinity;
      if (ta === tb) return a.index - b.index;
      return tb > ta ? 1 : -1;
    })
    .map(({ item }) => item);
}

/** Fold the inbox into one group per job, newest job first. */
export function groupInbox(items: Notification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const byOrder = new Map<string, NotificationGroup>();
  for (const item of newestFirst(items)) {
    const orderId = item.orderId || null;
    const existing = orderId ? byOrder.get(orderId) : undefined;
    if (existing) {
      existing.items.push(item);
      continue;
    }
    const group: NotificationGroup = {
      key: orderId ? `order:${orderId}` : `note:${item.id}`,
      orderId,
      latest: item,
      items: [item],
    };
    groups.push(group);
    if (orderId) byOrder.set(orderId, group);
  }
  return groups;
}

/**
 * A group is unread when its newest row is: the card changes when the job
 * does, not once per event. Older rows left unread underneath are swept up
 * when the card is opened or swiped.
 */
export function isGroupUnread(
  group: NotificationGroup,
  isRead: (notification: Notification) => boolean,
): boolean {
  return !isRead(group.latest);
}

/** Split the grouped inbox by what the job's newest row asks of the client. */
export function partitionInbox(items: Notification[]): {
  needYou: NotificationGroup[];
  updates: NotificationGroup[];
} {
  const needYou: NotificationGroup[] = [];
  const updates: NotificationGroup[] = [];
  for (const group of groupInbox(items)) {
    if (presentNotification(group.latest).lane === "need_you") needYou.push(group);
    else updates.push(group);
  }
  return { needYou, updates };
}
