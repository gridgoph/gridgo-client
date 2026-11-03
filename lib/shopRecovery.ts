/**
 * When the shop on an order cannot take it or finish it.
 *
 * Contract: `docs/SHOP_RECOVERY_API.md` in gridgo-api (gridgoph/gridgo-supplier#102).
 * A shop that lets its one opening hour to accept run out, declines, or
 * cancels before the rider picks up stops the order — and so can Operations,
 * for lateness or a GRIDGO-side reason. GRIDGO looks for another vetted shop
 * for the same item and specs, and the client makes one decision: take that
 * shop and its new ready date, or a full refund. Nothing changes hands until
 * they choose, and a changed offer is shown again rather than accepted for them.
 *
 * Since gridgo-api#225 a move the client did not cause is priced by the
 * substitute-shop rule: a cheaper shop's difference comes back as a refund, a
 * dearer one is covered by GRIDGO up to a cap, and above the cap the client
 * pays the rest, picks another offered shop, or takes a full refund. An offer
 * without `pricing` (an older API, or a client-caused move) keeps the released
 * same-price wording and `canAccept`.
 *
 * The client is never told which shop, why it failed, or at what stage —
 * only that it could not take the order, and what happens next. The pricing's
 * own figures are the shops' prices, so the comparison is drawn on the
 * client's fee-inclusive Printing (`orderPrintingMinor`) and moved by the
 * difference, which is exactly what they pay or get back.
 */
import type { Notification, Order, OrderChangeRequest, ShopMovePricing, ShopRecovery, ShopRecoveryOption } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import type { OrderNextAction } from "@/lib/orderState";
import { readyByDate } from "@/lib/readyTime";
import { confirmedPaidMinor } from "@/lib/refunds";
import { orderPrintingMinor } from "@/lib/serviceFee";

export const SHOP_RECOVERY_HEADLINE = "Your shop could not take this order";
/** GRIDGO or the client's own change moved the order, not the shop failing. */
export const SHOP_MOVE_HEADLINE = "Your order needs to move to another shop";
export const SHOP_RECOVERY_NOTIFICATION_TYPE = "shop_recovery";

export type ShopRecoveryView =
  /** A replacement is on offer at no extra cost: accept it, or a full refund. */
  | { kind: "offer"; recovery: ShopRecovery; promiseBy: string; pricing: ShopMovePricing | null }
  /** The replacement costs more than GRIDGO covers: pay the rest, another shop, or a refund. */
  | {
      kind: "above_cap";
      recovery: ShopRecovery;
      promiseBy: string;
      pricing: ShopMovePricing;
      alternatives: (ShopRecoveryOption & { optionId: string })[];
    }
  /** They chose to pay the rest: the QR payment, or Operations checking it. */
  | { kind: "top_up"; recovery: ShopRecovery; amountMinor: number; change: OrderChangeRequest | null }
  /** Nothing compatible is free: the refund is the one way forward. */
  | { kind: "no_match"; recovery: ShopRecovery }
  /** Operations has to sort it out; the refund stays available. */
  | { kind: "operations"; recovery: ShopRecovery };

/** The price rule, when it applies to this offer; null keeps the released same-price copy. */
export function offerPricing(option: Pick<ShopRecoveryOption, "pricing"> | null | undefined): ShopMovePricing | null {
  const pricing = option?.pricing;
  return pricing && pricing.ruleApplies ? pricing : null;
}

/**
 * What the order screen draws for the shop's failure, or null when there is
 * nothing to decide: no failure, the replacement already accepted, or a refund
 * already chosen (the refund card then speaks for the order).
 */
export function shopRecoveryView(
  order: Pick<Order, "shopRecovery"> & Partial<Pick<Order, "changeRequests">>,
): ShopRecoveryView | null {
  const recovery = order.shopRecovery;
  if (!recovery) return null;
  if (recovery.status === "awaiting_client") {
    const replacement = recovery.replacement;
    const pricing = offerPricing(replacement);
    if (replacement?.promiseBy && pricing?.rule === "above_cap") {
      const alternatives = recovery.canPickAlternative
        ? (recovery.alternatives ?? []).filter(
            (option): option is ShopRecoveryOption & { optionId: string } =>
              Boolean(option.optionId && option.promiseBy),
          )
        : [];
      return { kind: "above_cap", recovery, promiseBy: replacement.promiseBy, pricing, alternatives };
    }
    if (recovery.canAccept && replacement?.promiseBy) {
      return { kind: "offer", recovery, promiseBy: replacement.promiseBy, pricing };
    }
    return { kind: "no_match", recovery };
  }
  if (recovery.status === "awaiting_payment") {
    const changeId = recovery.topUp?.changeRequestId;
    const change = (order.changeRequests ?? []).find((row) => row.id === changeId) ?? null;
    return { kind: "top_up", recovery, amountMinor: change?.totalMinor ?? recovery.topUp?.amountMinor ?? 0, change };
  }
  if (recovery.status === "ops_review") return { kind: "operations", recovery };
  return null;
}

/** The top-up is with Operations: nothing to do but wait. */
export function topUpChecking(view: ShopRecoveryView | null): boolean {
  return view?.kind === "top_up" && view.change?.status === "pending_confirmation";
}

/** The order is stopped until the client or Operations decides. */
export function shopRecoveryPending(order: Pick<Order, "shopRecovery">): boolean {
  return shopRecoveryView(order) != null;
}

/** The card's headline: the shop failing, or GRIDGO moving the order. */
export function shopRecoveryHeadline(recovery: Pick<ShopRecovery, "fault">): string {
  return !recovery.fault || recovery.fault === "shop" ? SHOP_RECOVERY_HEADLINE : SHOP_MOVE_HEADLINE;
}

/** "Your shop could not take this order." or "Your order needs to move to another shop." */
function lead(recovery: Pick<ShopRecovery, "fault">): string {
  return `${shopRecoveryHeadline(recovery)}.`;
}

/** What one offered shop costs the client, in a few words. */
export function optionPriceLine(pricing: ShopMovePricing | null): string {
  if (!pricing) return "Same price";
  if (pricing.refundMinor > 0) return `${formatPhp(pricing.refundMinor)} back to you`;
  if (pricing.clientPaysMinor > 0) return `You pay ${formatPhp(pricing.clientPaysMinor)} more`;
  return "You pay nothing extra";
}

export type PriceComparison = {
  /** The client's own Printing, GRIDGO's charge inside; null when the order has no total. */
  wasMinor: number | null;
  /** That Printing moved by the difference: what the job costs them with the new shop. */
  nowMinor: number | null;
  rows: { label: string; value: string }[];
  /** One plain sentence on what happens to the money. */
  note: string;
};

/**
 * The comparison drawn before the client confirms. Every figure is one the
 * client pays, gets back, or is spared — never the shops' own prices.
 */
export function priceComparison(
  order: Parameters<typeof orderPrintingMinor>[0],
  pricing: ShopMovePricing,
): PriceComparison {
  const wasMinor = orderPrintingMinor(order);
  const nowMinor = wasMinor == null ? null : wasMinor + pricing.differenceMinor;
  const difference = formatPhp(Math.abs(pricing.differenceMinor));
  if (pricing.refundMinor > 0) {
    return {
      wasMinor,
      nowMinor,
      rows: [{ label: "Comes back to you", value: formatPhp(pricing.refundMinor) }],
      note: `The new shop costs ${difference} less. GRIDGO sends the difference back to you as a refund.`,
    };
  }
  if (pricing.differenceMinor <= 0) {
    return { wasMinor, nowMinor, rows: [], note: "Same price. You pay nothing extra." };
  }
  if (pricing.clientPaysMinor > 0) {
    return {
      wasMinor,
      nowMinor,
      rows: [
        { label: "GRIDGO covers", value: formatPhp(pricing.gridgoCoverMinor) },
        { label: "You pay", value: formatPhp(pricing.clientPaysMinor) },
      ],
      note: `The new shop costs ${difference} more. GRIDGO covers ${formatPhp(pricing.gridgoCoverMinor)} of it, and the rest is ${formatPhp(pricing.clientPaysMinor)}.`,
    };
  }
  return {
    wasMinor,
    nowMinor,
    rows: [
      { label: "GRIDGO covers", value: formatPhp(pricing.gridgoCoverMinor) },
      { label: "You pay", value: "Nothing extra" },
    ],
    note: `The new shop costs ${difference} more. GRIDGO covers it, so you pay nothing extra.`,
  };
}

/** Said under "Accept the new shop", so the client reads what accepting does. */
export function shopRecoveryAcceptNote(pricing: ShopMovePricing | null): string {
  if (!pricing) return SHOP_RECOVERY_ACCEPT_NOTE;
  const start = "The new shop confirms within an hour of their opening time, then printing starts.";
  return pricing.refundMinor > 0
    ? `Same item, same specs. ${start} Add your receiving QR so GRIDGO can send the ${formatPhp(pricing.refundMinor)} back.`
    : `Same item, same specs, nothing extra to pay. ${start}`;
}

/** "Pay the rest": what happens after the tap. */
export function payTheRestNote(amountMinor: number): string {
  return `Next you pay ${formatPhp(amountMinor)} by QR. The new shop starts once Operations confirms it. You can still choose a full refund until then.`;
}

/** An alternative's button: picked by its day, since the shop is never named. */
export function alternativeLabel(option: Pick<ShopRecoveryOption, "promiseBy">): string {
  const date = new Date(option.promiseBy);
  if (Number.isNaN(date.getTime())) return "Pick another shop";
  const day = date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
  return `Pick the shop ready ${day}`;
}

/** An alternative's note: its ready date, what it costs and what happens next. */
export function alternativeNote(option: Pick<ShopRecoveryOption, "pricing" | "promiseBy">): string {
  const pricing = offerPricing(option);
  const line = optionPriceLine(pricing);
  const ready = readyByDate(option.promiseBy);
  const money = pricing && pricing.clientPaysMinor > 0
    ? `${line}, paid by QR before it starts.`
    : pricing && pricing.refundMinor > 0
      ? `${line} as a refund.`
      : `${line}.`;
  return ready ? `Ready by ${ready}. ${money}` : money;
}

/** What the accept call carries for an offer: consent to exactly what they saw. */
export function acceptChoice(
  option: Pick<ShopRecoveryOption, "pricing"> & { optionId?: string | null },
  asAlternative: boolean,
): { optionId?: string; acceptTopUpMinor?: number } {
  const pays = offerPricing(option)?.clientPaysMinor ?? 0;
  return {
    ...(asAlternative && option.optionId ? { optionId: option.optionId } : {}),
    ...(pays > 0 ? { acceptTopUpMinor: pays } : {}),
  };
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
export function shopRecoveryNextAction(
  order: Pick<Order, "shopRecovery"> & Partial<Pick<Order, "changeRequests">>,
): OrderNextAction | null {
  const view = shopRecoveryView(order);
  if (!view || view.kind === "operations" || topUpChecking(view)) return null;
  const opening = lead(view.recovery);
  if (view.kind === "top_up") {
    return {
      title: `Pay ${formatPhp(view.amountMinor)} for the new shop`,
      body: "You chose to pay the rest. The new shop starts once Operations confirms your QR payment.",
      tone: "warning",
      icon: "wallet",
    };
  }
  if (view.kind === "above_cap") {
    return {
      title: "Choose how your order goes on",
      body: `${opening} The new shop costs more than GRIDGO can cover. Pay the rest, pick another shop, or get a full refund.`,
      tone: "info",
      icon: "square-pen",
    };
  }
  return view.kind === "offer"
    ? {
        title: "Choose the new shop or a refund",
        body: view.pricing
          ? `${opening} GRIDGO found another one for the same item. ${optionPriceLine(view.pricing)}.`
          : `${opening} GRIDGO found another one for the same item and price.`,
        tone: "info",
        icon: "square-pen",
      }
    : {
        title: "Choose a full refund",
        body: `${opening.slice(0, -1)}, and no other shop can print it exactly as ordered right now.`,
        tone: "info",
        icon: "square-pen",
      };
}

/** The wait line while Operations has it, or has the top-up to check. */
export function shopRecoveryWaitingOn(
  order: Pick<Order, "shopRecovery"> & Partial<Pick<Order, "changeRequests">>,
): string | null {
  const view = shopRecoveryView(order);
  if (topUpChecking(view)) {
    return "We are checking your payment for the new shop. It starts once Operations confirms it.";
  }
  return view?.kind === "operations"
    ? `${lead(view.recovery)} Operations will contact you about what happens next.`
    : null;
}

/**
 * Said before a refund chosen from this decision is withdrawn: withdrawing
 * puts the client back at the choice they left, not on a job carrying on.
 */
export function shopRecoveryWithdrawNote(order: Pick<Order, "shopRecovery">, refundId: string): string | null {
  const recovery = order.shopRecovery;
  if (!recovery || recovery.status !== "refund_requested" || recovery.refundRequestId !== refundId) return null;
  return recovery.topUp
    ? "Nothing is refunded, and you go back to paying the rest for the new shop."
    : "Nothing is refunded, and you go back to choosing what happens with your order.";
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
  const title = /needs to move/i.test(body) ? SHOP_MOVE_HEADLINE : SHOP_RECOVERY_HEADLINE;
  if (/accepted a replacement/i.test(body)) {
    return {
      title: "New shop on your order",
      body: "You accepted the new shop. They confirm within an hour of their opening time.",
    };
  }
  if (/pay the price difference/i.test(body)) {
    return {
      title: "Pay the rest for your new shop",
      body: "You chose to pay the rest. The new shop starts once Operations confirms your QR payment.",
    };
  }
  if (/full refund/i.test(body) && /chose/i.test(body)) {
    return {
      title: "Full refund requested",
      body: "Operations reviews it and sends what you paid to your receiving QR.",
    };
  }
  if (/reviewing/i.test(body)) {
    return { title, body: "Operations will contact you about what happens next." };
  }
  if (/no replacement/i.test(body)) {
    return { title, body: "No other shop can print it as ordered. You can choose a full refund." };
  }
  if (/more than GRIDGO can cover/i.test(body)) {
    return {
      title,
      body: "The new shop costs more than GRIDGO can cover. Open the order to pay the rest, pick another shop, or choose a full refund.",
    };
  }
  return {
    title,
    body: "GRIDGO found another shop for the same item. Open the order to see the price, then accept it or choose a full refund.",
  };
}

/** Whether the row still asks the client to choose (or to pay what they chose). */
export function shopRecoveryNotificationNeedsYou(notification: Pick<Notification, "type" | "body">): boolean {
  if (notification.type !== SHOP_RECOVERY_NOTIFICATION_TYPE) return false;
  return !/accepted a replacement|chose a full refund|reviewing/i.test(notification.body ?? "");
}

/** Whether this change request is the "pay the rest" for a shop move, which the recovery owns. */
export function isShopMoveTopUp(
  order: Partial<Pick<Order, "shopRecovery" | "shopMoves">>,
  changeId: string,
): boolean {
  return (
    order.shopRecovery?.topUp?.changeRequestId === changeId ||
    (order.shopMoves ?? []).some((move) => move.topUpChangeRequestId === changeId)
  );
}

/**
 * The money side of each accepted move, for Payment details: a line each,
 * under the total rather than in it, because committed order money never
 * changes on a move (gridgo-api#225) — a credit comes back on its own and a
 * paid top-up is already its own row.
 */
export function shopMoveLines(order: Pick<Order, "shopMoves">): string[] {
  return (order.shopMoves ?? []).flatMap((move) => {
    if (move.status === "refund_requested") return [];
    if ((move.refundMinor ?? 0) > 0) {
      const amount = formatPhp(move.refundMinor as number);
      return [
        move.refundStatus === "reconciliation_required"
          ? `Your order moved to a shop that costs ${amount} less. Operations will contact you about sending it back.`
          : `Your order moved to a shop that costs ${amount} less. It comes back to you as a credit.`,
      ];
    }
    const cover = move.gridgoCoverMinor ?? 0;
    if (cover > 0) return [`Your order moved to another shop. GRIDGO covered ${formatPhp(cover)} of its price.`];
    return [];
  });
}
