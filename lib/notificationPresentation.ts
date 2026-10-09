import { formatPhp, type Notification } from "@/lib/api";
import { GRIDGO_OFFICE_LABEL } from "@/lib/gridgoOffice";
import { isJobComplete } from "@/lib/jobComplete";
import { orderReference } from "@/lib/orderReference";
import { isApplicationNotification } from "@/lib/organization";
import { refundNotificationCopy } from "@/lib/refunds";
import { formatTimelineStamp } from "@/lib/relativeTime";
import { rescheduleNotificationCopy, rescheduleNotificationNeedsYou } from "@/lib/reschedule";
import {
  SHOP_RECOVERY_NOTIFICATION_TYPE,
  shopRecoveryNotificationCopy,
  shopRecoveryNotificationNeedsYou,
} from "@/lib/shopRecovery";
import type { OrderStatusTone } from "@/lib/orderState";
import {
  fulfilmentRailKind,
  orderStageIndex,
  stagesForRail,
  type FulfilmentRailKind,
} from "@/lib/orderStages";
import { CALL_INCOMING_TYPE, isCallNotificationType } from "@/lib/orderCalls";

/**
 * How one inbox row should read, independent of how the server first worded it.
 *
 * Collect jobs used to reuse delivery titles ("Out for delivery") and the
 * door-shaped rail. The list payload now carries fulfillmentMode; this module
 * turns that into a counter docket vs a door slip so a pickup is unmistakable.
 */

export type NotificationLane = "need_you" | "update";

/** Icons a callout can carry. `NotificationCard` owns the Lucide registry. */
export type NotificationCalloutIcon =
  | "wallet"
  | "clock"
  | "upload"
  | "square-pen"
  | "package-check"
  | "star";

/**
 * The one thing on a card the client must do or know.
 *
 * Drawn as a toned panel under the update, never as more body text: it is the
 * reason a client opens the card, so it must not read like the paragraph
 * above it. Only one per card, and none when there is nothing to do or know.
 * The tone is the action's, the same rule as the Home docket's mark: amber
 * for something to do, blue for something being checked, green for ready.
 */
export type NotificationCallout = {
  tone: OrderStatusTone;
  icon: NotificationCalloutIcon;
  title: string;
  detail: string | null;
};

export type PresentedNotification = {
  stamp: string | null;
  title: string;
  body: string;
  jobLine: string | null;
  /** "3FF0-128E-105A" — the job's reference, when the update is about one job. */
  reference: string | null;
  railKind: FulfilmentRailKind | null;
  stageIndex: number | null;
  /** The stage's own name ("Printing"), or null when no stage is known. */
  stageLabel: string | null;
  collectHold: boolean;
  collectReady: boolean;
  lane: NotificationLane;
  hint: string | null;
  callout: NotificationCallout | null;
};

/**
 * The hub's own reminders (gridgo-api#124): ready, then one per missed hub
 * day. The server's body already counts the days and says the order is not
 * forfeited, so it is kept; the title says which moment this is.
 */
const HUB_TYPES = ["hub_ready", "hub_unclaimed_reminder", "hub_unclaimed_warning"] as const;

function isHubType(type: string | null | undefined): boolean {
  return (HUB_TYPES as readonly string[]).includes(type ?? "");
}

/** A third missed day: Operations follows up, and redelivery can be asked for. */
function hubRedeliveryOpen(notification: Pick<Notification, "type" | "body">): boolean {
  return notification.type === "hub_unclaimed_warning" && /redeliver/i.test(notification.body);
}

function hubCopy(notification: Notification): { title: string; body: string; hint: string } {
  const title =
    notification.type === "hub_ready"
      ? "Ready at the hub"
      : notification.type === "hub_unclaimed_reminder"
        ? "Still waiting at the hub"
        : hubRedeliveryOpen(notification)
          ? "Operations will follow up"
          : "Collect your order soon";
  return { title, body: notification.body, hint: "Open for your claim code" };
}

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
        body: `Packed. A rider will bring it to the ${GRIDGO_OFFICE_LABEL} counter.`,
        hint: "Opens this job",
      };
    case "rider_assigned":
      return {
        title: "A rider is collecting it",
        body: "A rider is picking it up to bring it to the office.",
        hint: "Opens this job",
      };
    case "picked_up":
    case "out_for_delivery":
      return {
        title: "On the way to GRIDGO Office",
        body: `The rider is bringing it to the ${GRIDGO_OFFICE_LABEL} counter. We'll tell you when to come.`,
        hint: "Opens this job",
      };
    case "awaiting_collection":
      return hold
        ? {
            title: "Settle, then collect",
            body: `Your order is waiting at ${GRIDGO_OFFICE_LABEL}.`,
            hint: "Open to pay",
          }
        : {
            title: "Waiting at the counter",
            body: `Your order is on the ${GRIDGO_OFFICE_LABEL} counter.`,
            hint: "Open for the address",
          };
    case "delivered":
    case "issue_window_open":
      return {
        title: "Collected",
        body:
          notification.orderState === "issue_window_open"
            ? `Collected at the ${GRIDGO_OFFICE_LABEL} counter. Report anything wrong while the issue window is open.`
            : `Collected at the ${GRIDGO_OFFICE_LABEL} counter.`,
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
      ? `Your order was collected at ${GRIDGO_OFFICE_LABEL} and the check window has closed, so nothing more is needed from you.`
      : "Your order was delivered and the check window has closed, so nothing more is needed from you.",
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
    body: "Rate this job so GRIDGO can send your next one to a shop that did well by you.",
    hint: "Open to rate",
  };
}

/**
 * Call rows (gridgo-api `docs/CALLS_API.md`). The server's incoming copy says
 * "open to answer", which is false a minute later and forever after in the
 * inbox, so both rows are worded as what happened.
 */
function callCopy(type: string): { title: string; body: string; hint: string } {
  return type === CALL_INCOMING_TYPE
    ? {
        title: "Your rider called",
        body: "Open the order to call back while they have the delivery. Your phone number stays private.",
        hint: "Opens this job",
      }
    : {
        title: "Missed call from your rider",
        body: "Open the order to call back while they have the delivery. Your phone number stays private.",
        hint: "Opens this job",
      };
}

function receiptReadyCopy(showServiceFee: boolean): { title: string; body: string; hint: string } {
  return {
    title: "Your receipt is ready",
    // The server's own body names the fee; this copy replaces it so the
    // switch decides (`serviceFeeVisibleToClient`).
    body: showServiceFee
      ? "It lists printing, delivery, the service fee, the total and your payment reference."
      : "It lists printing, delivery, the total and your payment reference.",
    hint: "Opens the receipt",
  };
}

/**
 * What each "needs you" update asks for, in the Home docket's verbs, and the
 * live job states in which it is still being asked. A row outlives its ask:
 * the price notice is still the newest row while the job is on the press, and
 * telling that client to pay would be a callout nobody can act on.
 */
const SHOP_CHOICE_CALLOUT: NotificationCallout = {
  tone: "info",
  icon: "square-pen",
  title: "Choose the new shop or a refund",
  detail: "Open the order to decide.",
};

const TYPE_CALLOUTS: Record<string, { states: string[]; callout: NotificationCallout }> = {
  order_client_correction: {
    states: ["client_correction"],
    callout: {
      tone: "warning",
      icon: "upload",
      title: "Replace the artwork",
      detail: "Upload a corrected file from the order.",
    },
  },
  order_proof_approval: {
    states: ["proof_approval"],
    callout: {
      tone: "info",
      icon: "square-pen",
      title: "Approve your artwork proof",
      detail: "Or ask for changes from the order.",
    },
  },
  supplier_assignment_final_price: {
    states: ["supplier_assigned", "awaiting_downpayment", "awaiting_initial_payment"],
    callout: {
      tone: "warning",
      icon: "wallet",
      title: "Review the price and pay",
      detail: "Production starts once Operations confirms your payment.",
    },
  },
  // The shop's request leaves the order in production; answering it writes a
  // newer row, so the ask only stands while this row leads the job.
  order_reschedule_requested: {
    states: ["production", "supplier_self_qc"],
    callout: {
      tone: "warning",
      icon: "clock",
      title: "Answer within 24 hours",
      detail: "Accept the new date or decline it from the order.",
    },
  },
  order_reschedule_declined: {
    states: ["production", "supplier_self_qc"],
    callout: SHOP_CHOICE_CALLOUT,
  },
  order_reschedule_rematch_refreshed: {
    states: ["production", "supplier_self_qc"],
    callout: SHOP_CHOICE_CALLOUT,
  },
  order_rate_reminder: {
    states: ["delivered", "issue_window_open", "completed", "payout_released"],
    callout: {
      tone: "info",
      icon: "star",
      title: "Rate this job",
      detail: "The prompt sits under the order summary.",
    },
  },
};

function isShopChangeRow(notification: Pick<Notification, "type">): boolean {
  return (
    notification.type === SHOP_RECOVERY_NOTIFICATION_TYPE ||
    Boolean(notification.type?.startsWith("order_reschedule_"))
  );
}

function calloutFor(
  notification: Notification,
  hold: boolean,
  collectReady: boolean,
): NotificationCallout | null {
  // A shop that dropped the job, or asked for more time, holds it: the row
  // says what to decide, never "pay" for work that is not being done.
  const payment = isShopChangeRow(notification) ? undefined : notification.paymentAction;
  if (payment && payment.amountMinor > 0) {
    const amount = formatPhp(payment.amountMinor);
    return payment.status === "due"
      ? {
          tone: "warning",
          icon: "wallet",
          title: `Pay the final ${amount}`,
          detail: "Open the order for the QR code and receipt upload.",
        }
      : {
          tone: "info",
          icon: "clock",
          title: `Final payment ${amount} is being checked`,
          detail: "Do not pay again.",
        };
  }
  if (hold) {
    return {
      tone: "warning",
      icon: "wallet",
      title: "Pay the balance before you travel",
      detail: "The counter releases it once Operations confirms payment.",
    };
  }
  if (collectReady && hubRedeliveryOpen(notification)) {
    return {
      tone: "warning",
      icon: "package-check",
      title: "Collect it, or ask for redelivery",
      detail: "Redelivery is at your own cost. Open the order to choose.",
    };
  }
  if (collectReady) {
    return {
      tone: "success",
      icon: "package-check",
      title: `Collect at ${GRIDGO_OFFICE_LABEL}`,
      detail: isHubType(notification.type)
        ? "Show the QR and code from the order."
        : "Open the order for what to bring.",
    };
  }
  if (shopRecoveryNotificationNeedsYou(notification)) {
    return /no replacement/i.test(notification.body)
      ? { ...SHOP_CHOICE_CALLOUT, title: "Choose a full refund" }
      : SHOP_CHOICE_CALLOUT;
  }
  const asked = notification.type ? TYPE_CALLOUTS[notification.type] : undefined;
  if (!asked) return null;
  // An older record with no live state cannot be shown stale, so it keeps its ask.
  if (notification.orderState && !asked.states.includes(notification.orderState)) return null;
  return asked.callout;
}

/**
 * A sent-back account application asks for something only while it is still
 * sent back, and only on the newest send-back; older ones, and every one once
 * it has been resent, are history (gridgo-client#187). The rows carry no live
 * state, so the caller names the one row still asking (`openApplicationNoticeId`).
 */
const APPLICATION_SENT_BACK_CALLOUT: NotificationCallout = {
  tone: "warning",
  icon: "upload",
  title: "Fix your application",
  detail: "What you sent is kept. Fix only what Operations asked for.",
};

/** The newest send-back while the application is still sent back, else null. */
export function openApplicationNoticeId(items: Notification[], sentBack: boolean): string | null {
  if (!sentBack) return null;
  let newest: Notification | null = null;
  for (const item of items) {
    if (item.type === "approval_rejected" && (!newest || Date.parse(item.at) > Date.parse(newest.at))) newest = item;
  }
  return newest?.id ?? null;
}

export type PresentOptions = { showServiceFee?: boolean; applicationNoticeId?: string | null };

export function presentNotification(
  notification: Notification,
  { showServiceFee = false, applicationNoticeId = null }: PresentOptions = {},
): PresentedNotification {
  const applicationAsk = notification.type === "approval_rejected" && notification.id === applicationNoticeId;
  const eventState = notification.eventState ?? notification.orderState;
  const event = notification.eventState ? { ...notification, orderState: eventState } : notification;
  const payment = isShopChangeRow(notification) ? undefined : notification.paymentAction;
  const paymentPending = payment != null && payment.amountMinor > 0;
  const collect = isCollect(notification);
  const hold = collectionHeld(notification);
  const refund =
    refundNotificationCopy(notification.type) ??
    shopRecoveryNotificationCopy(notification) ??
    rescheduleNotificationCopy(notification.type);
  const overlay = refund
    ? { ...refund, hint: notification.orderId ? "Opens this job" : null }
    : notification.type === "order_rate_reminder"
      ? rateReminderCopy()
      : notification.type === "order_receipt_ready"
        ? receiptReadyCopy(showServiceFee)
      : isCallNotificationType(notification.type)
        ? callCopy(notification.type ?? "")
        : isHubType(notification.type) && notification.orderState === "awaiting_collection" && !hold
          ? hubCopy(notification)
        : isJobComplete(eventState)
          ? completeCopy(collect)
          : collect
            ? collectCopy(event, hold && eventState === notification.orderState)
            : {
                title: notification.title,
                body: notification.body,
                hint: notification.orderId
                  ? "Opens this job"
                  : isApplicationNotification(notification.type)
                    ? "Opens your application"
                    : null,
              };
  const collectReady =
    collect && notification.orderState === "awaiting_collection" && !hold;
  const needsYou =
    payment?.status === "due" ||
    hold ||
    collectReady ||
    (notification.type != null && NEED_YOU_TYPES.has(notification.type)) ||
    shopRecoveryNotificationNeedsYou(notification) ||
    rescheduleNotificationNeedsYou(notification.type) ||
    applicationAsk;

  const railKind = eventState
    ? fulfilmentRailKind(collect ? "pickup" : notification.fulfillmentMode)
    : null;
  const stageIndex = orderStageIndex(eventState, collect ? "pickup" : notification.fulfillmentMode);
  const stageLabel =
    railKind && stageIndex != null ? stagesForRail(railKind)[stageIndex]?.label ?? null : null;

  return {
    stamp: collect
      ? collectStamp(eventState, hold && eventState === notification.orderState)
      : deliveryStamp(eventState),
    title: overlay.title,
    body: overlay.body,
    jobLine: notification.orderTitle?.trim() || null,
    reference: orderReference(notification.orderId),
    railKind,
    stageIndex,
    stageLabel,
    collectHold: hold,
    collectReady,
    lane: needsYou ? "need_you" : "update",
    hint: paymentPending ? "Opens current payment details" : overlay.hint,
    callout: applicationAsk ? APPLICATION_SENT_BACK_CALLOUT : calloutFor(notification, hold, collectReady),
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
export function partitionInbox(
  items: Notification[],
  options: Pick<PresentOptions, "applicationNoticeId"> = {},
): {
  needYou: NotificationGroup[];
  updates: NotificationGroup[];
} {
  const needYou: NotificationGroup[] = [];
  const updates: NotificationGroup[] = [];
  for (const group of groupInbox(items)) {
    if (presentNotification(group.latest, options).lane === "need_you") needYou.push(group);
    else updates.push(group);
  }
  return { needYou, updates };
}

/**
 * One line of a job's earlier-updates timeline: a day heading, or an update.
 *
 * The API often writes several rows in the same minute (a payment confirmed
 * and the job released together), and a stamp on every row repeated
 * "Sep 20, 3:00 PM" down the list. So the day is said once, as a heading, and
 * a time is said only when it differs from the update above it.
 */
export type TimelineRow =
  | { kind: "day"; key: string; label: string }
  | {
      kind: "entry";
      key: string;
      title: string;
      /** "3:00 PM"; null when the update above it carries the same time. */
      time: string | null;
      /** The exact stamp, for a screen reader, even where `time` is shared. */
      exact: string;
    };

function localDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(ms: number, now: number): string {
  const day = localDayKey(ms);
  if (day === localDayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === localDayKey(yesterday.getTime())) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-PH", { day: "numeric", month: "short" });
}

/** Earlier updates, newest first as given, with a heading at each new day. */
export function timelineRows(
  items: Notification[],
  now: number = Date.now(),
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let lastDay: string | null = null;
  let lastTime: string | null = null;
  for (const item of items) {
    const ms = Date.parse(item.at);
    const known = Number.isFinite(ms);
    const day = known ? localDayKey(ms) : "unknown";
    if (day !== lastDay) {
      rows.push({
        kind: "day",
        key: `day:${day}:${item.id}`,
        label: known ? dayLabel(ms, now) : "Date unknown",
      });
      lastDay = day;
      lastTime = null;
    }
    const time = known
      ? new Date(ms).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })
      : null;
    rows.push({
      kind: "entry",
      key: item.id,
      title: presentNotification(item).title,
      time: time && time !== lastTime ? time : null,
      exact: formatTimelineStamp(item.at),
    });
    lastTime = time;
  }
  return rows;
}
