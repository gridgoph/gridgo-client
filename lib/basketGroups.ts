/**
 * A basket printed by more than one shop (gridgo-api#117,
 * `docs/MULTI_SHOP_CHECKOUT_API.md`).
 *
 * One basket can hold products GRIDGO matched to different shops. The client
 * still makes one order and one payment, but each shop is a *group* — its own
 * print run, its own rider, its own delivery fee and its own progress. Groups
 * are named "Shop A", "Shop B" by GRIDGO, never by who the shop is.
 *
 * Decided with Operations (4–5 Oct 2026), and the rules here follow them:
 * - one deadline and one delivery-or-pick-up choice for the whole basket;
 * - a multi-shop basket is paid in full up front, in one transfer;
 * - one combined receipt with a section per group;
 * - a hub pick-up fee is charged once per basket, not once per shop.
 *
 * Every figure comes from GRIDGO's own groups (`cart.groups`) and quote
 * (`cart.clientQuote`): fee-inclusive client prices and the server's delivery
 * quote. A multi-shop basket withholds the shop ids and pins, so nothing here
 * could measure a shop even if it wanted to. A single-shop basket keeps every
 * screen exactly as it was — `isMultiShop` is the switch.
 */

import type {
  BasketGroup,
  Cart,
  CartLineRecord,
  DistanceZone,
  MatchInput,
  Order,
} from "@/lib/api";
import { getOrderStateMeta, type OrderStateMeta } from "@/lib/orderState";
import { organizationDiscountOf } from "@/lib/organization";

/** What a basket line is grouped by: its group on a multi-shop basket, else its shop. */
export function lineGroupKey(line: Pick<CartLineRecord, "id" | "groupId" | "supplierId">): string {
  return line.groupId ?? line.supplierId ?? line.id;
}

/** True when the basket is printed by two or more shops. */
export function isMultiShop(cart: Pick<Cart, "groups"> | null | undefined): boolean {
  return (cart?.groups?.length ?? 0) > 1;
}

/** "A" from "Shop A" — the letter on the group's plate. */
export function groupLetter(label: string): string {
  const letter = label.replace(/^shop\s+/i, "").trim();
  return letter || label;
}

export type ShopGroupView = {
  id: string;
  label: string;
  letter: string;
  lines: CartLineRecord[];
  /** GRIDGO's figure for the group's items, fee inside. Null while unpriced. */
  itemsMinor: number | null;
  /** This group's own delivery fee. Null until GRIDGO can price it. */
  deliveryFeeMinor: number | null;
  totalMinor: number | null;
  /** The organization discount on this group alone; 0 when there is none (#166). */
  organizationDiscountMinor: number;
  /** The zone word GRIDGO priced the group's delivery in, when it has one. */
  zone: DistanceZone | null;
  /** Only for an Out of Zone leg — the one place a client reads kilometres. */
  distanceKm: number | null;
};

/**
 * The basket by shop group, in the order the groups were started.
 *
 * Lines are taken from each group's `lineIds`, so the grouping is GRIDGO's,
 * never a guess on the phone. The zone comes from GRIDGO's quote leg that
 * covers the same lines.
 */
export function shopGroups(cart: Cart | null | undefined): ShopGroupView[] {
  if (!cart?.groups) return [];
  const byId = new Map(cart.lines.map((line) => [line.id, line]));
  const legs = cart.clientQuote?.deliveryLines ?? [];
  return cart.groups.map((group) => {
    const leg = legs.find((candidate) =>
      candidate.lineIds.some((id) => group.lineIds.includes(id)),
    );
    return {
      id: group.id,
      label: group.label,
      letter: groupLetter(group.label),
      lines: group.lineIds
        .map((id) => byId.get(id))
        .filter((line): line is CartLineRecord => line != null),
      itemsMinor: safeMinor(group.clientItemSubtotalMinor),
      deliveryFeeMinor: safeMinor(group.deliveryFeeMinor),
      totalMinor: safeMinor(group.totalMinor),
      // Each shop group is discounted on its own, as GRIDGO prices it.
      organizationDiscountMinor: organizationDiscountOf(group),
      zone: leg?.distanceZone ?? null,
      distanceKm: typeof leg?.distanceKm === "number" ? leg.distanceKm : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export function addMoreFromLabel(label: string): string {
  return `Add more from ${label}`;
}

/** Why a multi-shop basket is paid in full, said before the client pays. */
export const MULTI_SHOP_PAYMENT_TITLE = "Paid in full, in one payment";

export function multiShopPaymentNote(groupCount: number): string {
  return (
    `Your order is printed by ${groupCount} shops, and each one prints and delivers on its own. ` +
    "So GRIDGO takes the whole total now, in one transfer that covers every shop, " +
    "instead of a balance later. Nothing is left to pay before delivery."
  );
}

/** The delivery rule for groups, said once under the groups. */
export function groupDeliveryNote(pickup: boolean): string {
  return pickup
    ? "Every shop's run comes to GRIDGO Office, so you collect it all in one place."
    : "Each shop delivers on its own, so each has its own delivery fee. Adding more from the same shop adds no delivery fee.";
}

export const ONE_DATE_NOTE =
  "One date for the whole order. GRIDGO only offers printers that can make it.";

export const BASKET_DATE_MISSING =
  "Choose one date for your whole order. Every shop in it is held to the same date.";

/** The overline over the groups: "2 SHOPS, ONE ORDER". */
export function groupsHeading(groupCount: number): string {
  return `${groupCount} SHOPS, ONE ORDER`;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * What a match must carry once the basket has something in it.
 *
 * The basket goes with the match so GRIDGO can hold every product to its one
 * deadline, recheck a shop's queue with what it is already printing, and keep
 * shop identities out of a multi-shop answer. The basket's deadline wins over
 * the date asked on this job; while it has none, this job's date becomes it.
 * `groupId` asks for more from one group's shop, and is dropped if that group
 * is no longer in the basket.
 */
export function basketMatchContext(
  cart: Cart | null | undefined,
  jobDeadline: string | null,
  groupId?: string | null,
): Pick<MatchInput, "cartId" | "deadline" | "groupId"> {
  if (!cart || cart.state !== "draft" || cart.lines.length === 0) return { deadline: jobDeadline };
  const group = groupId ? cart.groups?.find((candidate) => candidate.id === groupId) : undefined;
  return {
    cartId: cart.id,
    deadline: cart.deadline ?? jobDeadline,
    ...(group ? { groupId: group.id } : {}),
  };
}

/** The date every product in this basket is held to, once it has one. */
export function basketDeadlineOf(cart: Cart | null | undefined): string | null {
  if (!cart || cart.lines.length === 0) return null;
  return cart.deadline ?? null;
}

// ---------------------------------------------------------------------------
// After checkout
// ---------------------------------------------------------------------------

/** A group's chip, in the same words and tones as every other order chip. */
export function groupStateMeta(
  group: Pick<BasketGroup, "state">,
  fulfillmentMode?: string | null,
): OrderStateMeta {
  return getOrderStateMeta(group.state, fulfillmentMode, true);
}

/**
 * What happened to one group that stopped, in plain words, or null while it is
 * going. A cancelled group is refunded on its own from what was paid; the
 * others carry on.
 */
export function groupStoppedNote(
  order: Pick<Order, "state" | "groupLabel" | "refundDisposition" | "refundHold">,
): string | null {
  const label = order.groupLabel ?? "This shop group";
  if (order.refundHold) {
    return `${label} is paused while GRIDGO reviews your refund. The other shops in this order carry on.`;
  }
  if (order.refundDisposition === "fulfilled_with_refund") {
    return `Part of ${label}'s share was refunded to you. The other shops in this order were not affected.`;
  }
  if (order.state === "cancelled") {
    return order.refundDisposition === "cancelled"
      ? `${label} was cancelled and its share refunded to you on its own. The other shops in this order carry on.`
      : `${label} was cancelled. Its share is refunded on its own; the other shops in this order carry on.`;
  }
  return null;
}

/**
 * A stopped group's line on the combined receipt. The receipt keeps what was
 * paid; this says what became of that group since.
 */
export function receiptGroupStanding(group: Pick<BasketGroup, "state">): string | null {
  return group.state === "cancelled"
    ? "Cancelled after you placed the order. This group's share is refunded on its own."
    : null;
}

function safeMinor(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}
