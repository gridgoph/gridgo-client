/**
 * A basket printed by more than one shop (gridgo-api#117,
 * `docs/MULTI_SHOP_CHECKOUT_API.md`).
 *
 * One basket can hold products GRIDGO matched to different shops. The client
 * still makes one order and one payment, but each shop is a *group* — its own
 * print run, its own rider, its own delivery fee and its own progress. Groups
 * are named "Shop A", "Shop B" by GRIDGO, never by who the shop is.
 *
 * Decided with Operations (4–6 Oct 2026), and the rules here follow them:
 * - each product keeps the date the client chose for it (gridgo-client#189);
 *   a group is one delivery: a shop's products travel together by the
 *   earliest of their dates, unless the client chooses to deliver them
 *   separately — then each date is its own group, printed, delivered and
 *   charged delivery on its own (gridgo-api#275);
 * - one delivery-or-pick-up choice for the whole basket;
 * - a basket of two or more groups is paid in full up front, in one transfer;
 * - one combined receipt with a section per group;
 * - a hub pick-up fee is charged once per basket, not once per shop.
 *
 * Every figure comes from GRIDGO's own groups (`cart.groups`) and quote
 * (`cart.clientQuote`): fee-inclusive client prices and the server's delivery
 * quote. A multi-shop basket withholds the shop ids and pins, so nothing here
 * could measure a shop even if it wanted to. A one-group basket keeps every
 * screen exactly as it was — `isMultiShop` (two or more groups) is the switch.
 */

import type {
  Basket,
  BasketGroup,
  Cart,
  CartGroup,
  CartLineRecord,
  DistanceZone,
  MatchInput,
  Order,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import { parseDeadline } from "@/lib/deadline";
import { dayKeyOfDeadline } from "@/lib/deadlineCalendar";
import { userFacingError } from "@/lib/copy";
import { getOrderStateMeta, type OrderStateMeta } from "@/lib/orderState";
import { organizationDiscountOf } from "@/lib/organization";
import { voucherDiscountOf } from "@/lib/vouchers";

/** What a basket line is grouped by: its group on a multi-shop basket, else its shop. */
export function lineGroupKey(line: Pick<CartLineRecord, "id" | "groupId" | "supplierId">): string {
  return line.groupId ?? line.supplierId ?? line.id;
}

/**
 * True when the basket goes out as two or more groups — two shops, or one
 * shop on two dates. Every group is its own job, rider and delivery fee.
 */
export function isMultiShop(cart: Pick<Cart, "groups" | "isMultiGroup"> | null | undefined): boolean {
  if (typeof cart?.isMultiGroup === "boolean") return cart.isMultiGroup;
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
  /** The date this group is printed and delivered for; null is "no rush". */
  deadline: string | null;
  lines: CartLineRecord[];
  /** GRIDGO's figure for the group's items, fee inside. Null while unpriced. */
  itemsMinor: number | null;
  /** This group's own delivery fee. Null until GRIDGO can price it. */
  deliveryFeeMinor: number | null;
  totalMinor: number | null;
  /** The organization discount on this group alone; 0 when there is none (#166). */
  organizationDiscountMinor: number;
  /** This group's share of the one voucher; 0 or absent when there is none (gridgo-api#204). */
  voucherDiscountMinor?: number;
  /** The zone word GRIDGO priced the group's delivery in, when it has one. */
  zone: DistanceZone | null;
  /** Only for an Out of Zone leg — the one place a client reads kilometres. */
  distanceKm: number | null;
  /** Which of this shop's deliveries this is, once the shop is split (gridgo-api#275). */
  deliveryNumber?: number | null;
  shopDeliveryCount?: number | null;
  /** The shop has two or more products, so it could go out as separate deliveries. */
  canDeliverSeparately?: boolean;
};

/**
 * The basket by shop group, soonest date first.
 *
 * Lines are taken from each group's `lineIds`, so the grouping is GRIDGO's,
 * never a guess on the phone. The zone comes from GRIDGO's quote leg that
 * covers the same lines. Groups read as a timeline — what comes first is on
 * top — and groups on the same date keep the order they were started in.
 */
export function shopGroups(cart: Cart | null | undefined): ShopGroupView[] {
  if (!cart?.groups) return [];
  const byId = new Map(cart.lines.map((line) => [line.id, line]));
  const legs = cart.clientQuote?.deliveryLines ?? [];
  return byDate(cart.groups, (group) => groupDeadlineOf(group, cart)).map((group) => {
    const leg =
      legs.find((candidate) => candidate.groupId === group.id) ??
      legs.find((candidate) => candidate.lineIds.some((id) => group.lineIds.includes(id)));
    return {
      id: group.id,
      label: group.label,
      letter: groupLetter(group.label),
      deadline: groupDeadlineOf(group, cart),
      lines: group.lineIds
        .map((id) => byId.get(id))
        .filter((line): line is CartLineRecord => line != null),
      itemsMinor: safeMinor(group.clientItemSubtotalMinor),
      deliveryFeeMinor: safeMinor(group.deliveryFeeMinor),
      totalMinor: safeMinor(group.totalMinor),
      // Each shop group is discounted on its own, as GRIDGO prices it.
      organizationDiscountMinor: organizationDiscountOf(group),
      // One voucher over the whole basket, split by GRIDGO across the groups.
      // The group carries its share on some payloads; the quote always does.
      voucherDiscountMinor:
        voucherDiscountOf(group) ||
        voucherDiscountOf(cart.clientQuote?.voucherGroups?.find((share) => share.groupId === group.id)),
      zone: leg?.distanceZone ?? null,
      distanceKm: typeof leg?.distanceKm === "number" ? leg.distanceKm : null,
      // The quote's leg says the same thing; either one names the delivery.
      deliveryNumber: positiveInt(group.deliveryNumber ?? leg?.deliveryNumber),
      shopDeliveryCount: positiveInt(group.shopDeliveryCount ?? leg?.shopDeliveryCount),
      canDeliverSeparately: group.canDeliverSeparately === true,
    };
  });
}

// ---------------------------------------------------------------------------
// Dates (gridgo-client#189)
// ---------------------------------------------------------------------------

/**
 * The date a basket line was matched for. Each product keeps its own; an API
 * from before that held the whole basket to `cart.deadline`, which is where a
 * line without the field still reads its date from.
 */
export function lineDeadlineOf(
  line: Pick<CartLineRecord, "id" | "deadline">,
  cart: Pick<Cart, "deadline" | "groups"> | null | undefined,
): string | null {
  if (line.deadline !== undefined) return line.deadline ?? null;
  const group = cart?.groups?.find((candidate) => candidate.lineIds.includes(line.id));
  if (group && group.deadline !== undefined) return group.deadline ?? null;
  return cart?.deadline ?? null;
}

/** A group's date: its own, else its first line's, else an older basket's one date. */
export function groupDeadlineOf(
  group: Pick<CartGroup, "deadline" | "lineIds">,
  cart: Pick<Cart, "deadline" | "lines"> | null | undefined,
): string | null {
  if (group.deadline !== undefined) return group.deadline ?? null;
  const first = cart?.lines.find((line) => group.lineIds.includes(line.id));
  if (first && first.deadline !== undefined) return first.deadline ?? null;
  return cart?.deadline ?? null;
}

/** A placed group's date, falling back to the basket's one date on an older API. */
export function basketGroupDeadlineOf(
  group: Pick<BasketGroup, "deadline">,
  basket: Pick<Basket, "deadline"> | null | undefined,
): string | null {
  if (group.deadline !== undefined) return group.deadline ?? null;
  return basket?.deadline ?? null;
}

/** "Fri 12 Oct" — the day a group is for, in the clock the calendar set it with. */
export function groupDateLabel(deadline: string | null | undefined): string {
  const date = parseDeadline(deadline ?? null);
  if (!date) return "No set date";
  const weekday = date.toLocaleDateString("en-PH", { weekday: "short" });
  const day = date.toLocaleDateString("en-PH", { day: "numeric" });
  const month = date.toLocaleDateString("en-PH", { month: "short" });
  return `${weekday} ${day} ${month}`;
}

/** What a group's date means, said under its name. */
export function groupDateLine(deadline: string | null | undefined): string {
  return parseDeadline(deadline ?? null)
    ? `Needed by ${groupDateLabel(deadline)}`
    : "No set date — as soon as it is ready";
}

/** Soonest first; "no rush" last; ties keep the order they came in. */
export function byDate<T>(items: readonly T[], dateOf: (item: T) => string | null): T[] {
  const at = (item: T) => parseDeadline(dateOf(item))?.getTime() ?? Number.POSITIVE_INFINITY;
  return items
    .map((item, index) => ({ item, index, time: at(item) }))
    .sort((left, right) => left.time - right.time || left.index - right.index)
    .map((entry) => entry.item);
}

/** How many shops and how many dates a set of groups spans. */
export function groupSpread(groups: readonly { label: string; deadline: string | null }[]): {
  shops: number;
  dates: number;
} {
  return {
    shops: new Set(groups.map((group) => group.label)).size,
    dates: new Set(groups.map((group) => dayKeyOfDeadline(group.deadline) ?? "none")).size,
  };
}

/**
 * A date already in the basket, offered on the next product's date step: the
 * same date from the same shop rides in the same delivery.
 */
export type BasketDate = {
  dayKey: string;
  deadline: string;
  label: string;
  itemCount: number;
};

export function basketDates(cart: Cart | null | undefined): BasketDate[] {
  if (!cart || cart.state !== "draft") return [];
  const seen = new Map<string, BasketDate>();
  for (const line of cart.lines) {
    const deadline = lineDeadlineOf(line, cart);
    const dayKey = dayKeyOfDeadline(deadline);
    if (!deadline || !dayKey) continue;
    const known = seen.get(dayKey);
    if (known) known.itemCount += 1;
    else seen.set(dayKey, { dayKey, deadline, label: groupDateLabel(deadline), itemCount: 1 });
  }
  return byDate([...seen.values()], (entry) => entry.deadline);
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/**
 * A one-group basket's group, by name. Checkout never shows that basket a
 * letter, so "Add more from Shop A" would introduce a shop the client has
 * not met; "this shop" is the same promise without a new name.
 */
export const SINGLE_GROUP_LABEL = "this shop";

/** "Add more from Shop A for Fri 12 Oct" — the date is what keeps it in this delivery. */
export function addMoreFromLabel(label: string, deadline?: string | null): string {
  return parseDeadline(deadline ?? null)
    ? `Add more from ${label} for ${groupDateLabel(deadline)}`
    : `Add more from ${label}`;
}

/** Why a multi-group basket is paid in full, said before the client pays. */
export const MULTI_SHOP_PAYMENT_TITLE = "Paid in full, in one payment";

export function multiShopPaymentNote(groups: readonly { label: string; deadline: string | null }[]): string {
  const { shops, dates } = groupSpread(groups);
  const split =
    dates > 1 && shops > 1
      ? `${shops} shops on ${dates} dates`
      : dates > 1
        ? `${dates} parts, one for each date`
        : `${shops} shops`;
  return (
    `Your order goes out as ${split}, and each part prints and delivers on its own. ` +
    "So GRIDGO takes the whole total now, in one transfer that covers every part, " +
    "instead of a balance later. Nothing is left to pay before delivery."
  );
}

/** The delivery rule for groups, said once under the groups. */
export function groupDeliveryNote(pickup: boolean): string {
  return pickup
    ? "Every part comes to GRIDGO Office on its own date, so you collect it all in one place."
    : "Each shop sends its items together by the earliest date among them, with one delivery fee. Choose to deliver separately and each date comes on its own, with its own fee.";
}

/** The date step's note, when the basket already has dates in it. */
export const SAME_DATE_NOTE =
  "Each item keeps its own date. Items from the same shop go out together by the earliest of their dates, unless you choose separate deliveries at checkout.";

/** The overline over the groups: "2 SHOPS, ONE ORDER", "2 DATES, ONE ORDER". */
export function groupsHeading(groups: readonly { label: string; deadline: string | null }[]): string {
  const { shops, dates } = groupSpread(groups);
  if (shops > 1 && dates > 1) return `${shops} SHOPS, ${dates} DATES, ONE ORDER`;
  if (dates > 1) return `${dates} DATES, ONE ORDER`;
  return `${Math.max(shops, groups.length)} SHOPS, ONE ORDER`;
}

/**
 * A group in a money row or a receipt line: "Shop A", or "Shop A · Fri 12 Oct"
 * once the order spans more than one date — two "Shop A" rows would otherwise
 * read as the same charge twice.
 */
export function groupMoneyLabel(
  group: DeliveryOf & { deadline: string | null },
  all: readonly { label: string; deadline: string | null }[],
): string {
  const label = deliveryLabel(group);
  return groupSpread(all).dates > 1 ? `${label} · ${groupDateLabel(group.deadline)}` : label;
}

/**
 * A group's delivery-fee row before paying: "Delivery · Shop A", or
 * "Shop A, delivery 1 of 2" once that shop goes out separately — each of its
 * deliveries is a fee of its own, and the row says which.
 */
export function deliveryFeeRowLabel(
  group: DeliveryOf & { deadline: string | null },
  all: readonly { label: string; deadline: string | null }[],
): string {
  const label = groupMoneyLabel(group, all);
  return deliveryOf(group) ? label : `Delivery · ${label}`;
}

/** The title over a placed order's groups: "One order, 2 shops", "One order, 2 dates". */
export function placedGroupsTitle(groups: readonly { label: string; deadline: string | null }[]): string {
  const { shops, dates } = groupSpread(groups);
  if (groups.length < 2) return "One order, several parts";
  if (shops > 1 && dates > 1) return `One order, ${shops} shops on ${dates} dates`;
  if (dates > 1) return `One order, ${dates} dates`;
  return `One order, ${shops} shops`;
}

/**
 * "all 2 shops in this order", or "all 3 parts of this order" once one shop
 * delivers on more than one date — said where one payment covers them all.
 */
export function allGroupsPhrase(basket: Pick<Basket, "deadline" | "groups" | "shopCount">): string {
  const dated = basket.groups.map((group) => ({ label: group.label, deadline: basketGroupDeadlineOf(group, basket) }));
  const { dates } = groupSpread(dated);
  const count = basket.groups.length;
  // One label per shop, so fewer labels than groups is one shop on several dates.
  const shops = basket.shopCount ?? (dated.every((group) => group.label) ? groupSpread(dated).shops : count);
  return dates > 1 || shops < count ? `all ${count} parts of this order` : `all ${count} shops in this order`;
}

/** An order card's tag for one group: "Shop A · Fri 12 Oct", else "Shop A · multi-shop". */
export function groupTag(
  order: Pick<Order, "groupLabel" | "deadline" | "deliveryNumber" | "shopDeliveryCount">,
): string | null {
  if (!order.groupLabel) return null;
  const label = deliveryLabel({ ...order, label: order.groupLabel });
  return parseDeadline(order.deadline)
    ? `${label} · ${groupDateLabel(order.deadline)}`
    : `${label} · multi-shop`;
}

// ---------------------------------------------------------------------------
// Separate deliveries from one shop (gridgo-api#275, docs/SHOP_DELIVERIES_API.md)
// ---------------------------------------------------------------------------

/** Anything that may carry a shop's delivery position. */
type DeliveryOf = {
  label: string;
  deliveryNumber?: number | null;
  shopDeliveryCount?: number | null;
};

/**
 * "Delivery 1 of 2" — only for a shop split into separate deliveries. A shop
 * delivering once says nothing, so a single delivery reads as it always did.
 */
export function deliveryOf(group: Omit<DeliveryOf, "label">): string | null {
  const number = positiveInt(group.deliveryNumber);
  const count = positiveInt(group.shopDeliveryCount);
  if (number == null || count == null || count < 2) return null;
  return `Delivery ${number} of ${count}`;
}

/** "Shop A, delivery 1 of 2", or just "Shop A" for a shop delivering once. */
export function deliveryLabel(group: DeliveryOf): string {
  const of = deliveryOf(group);
  return of ? `${group.label}, ${of.charAt(0).toLowerCase()}${of.slice(1)}` : group.label;
}

/** The distinct dates among a group's products, soonest first. */
function lineDates(group: Pick<ShopGroupView, "lines">, cart: Pick<Cart, "deadline" | "groups"> | null | undefined): string[] {
  const seen = new Map<string, string>();
  for (const line of group.lines) {
    const deadline = lineDeadlineOf(line, cart);
    const key = dayKeyOfDeadline(deadline);
    if (deadline && key && !seen.has(key)) seen.set(key, deadline);
  }
  return byDate([...seen.values()], (deadline) => deadline);
}

/**
 * Said under a shop's products while they travel together across more than
 * one date: the delivery is due by the earliest. Null when they share a date.
 */
export function combinedDateLine(
  group: Pick<ShopGroupView, "lines" | "deadline">,
  cart: Pick<Cart, "deadline" | "groups"> | null | undefined,
): string | null {
  if (lineDates(group, cart).length < 2) return null;
  return `Delivered together by ${groupDateLabel(group.deadline)}, the earliest date here.`;
}

export type DeliveryChoice = {
  /** True while this shop goes out as more than one delivery. */
  separate: boolean;
  /** What a tap asks GRIDGO for. */
  split: "by_deadline" | "none";
  /** One plain line under the choice. */
  note: string;
};

/**
 * The "Deliver separately" choice for one group, or null where it would do
 * nothing. Offered on a shop whose products are on two or more dates and
 * still travel together, and — once split — on that shop's first delivery
 * only, so the shop has one control however many deliveries it became.
 */
export function deliveryChoice(
  group: ShopGroupView,
  cart: Cart | null | undefined,
): DeliveryChoice | null {
  if (cart?.state !== "draft" || !group.canDeliverSeparately) return null;
  const count = group.shopDeliveryCount ?? 1;
  if (count > 1) {
    if (group.deliveryNumber != null && group.deliveryNumber !== 1) return null;
    return {
      separate: true,
      split: "none",
      note: `${count} deliveries, each with its own delivery fee. Untick to send them together by the earliest date.`,
    };
  }
  const dates = lineDates(group, cart);
  if (dates.length < 2) return null;
  return {
    separate: false,
    split: "by_deadline",
    note: `One delivery for each date (${dates.map(groupDateLabel).join(", ")}), each with its own delivery fee.`,
  };
}

/**
 * Why GRIDGO refused a delivery choice, in plain words. A `deadline_not_met`
 * names the products that cannot make the date, from the basket's own lines.
 */
export function deliveryChoiceError(
  error: unknown,
  cart: Pick<Cart, "lines"> | null | undefined,
  split: "by_deadline" | "none",
): string {
  if (error instanceof ApiError && error.message === "deadline_not_met") {
    const body = (error.body ?? {}) as { lineIds?: unknown; deadline?: unknown };
    const ids = Array.isArray(body.lineIds) ? body.lineIds.filter((id): id is string => typeof id === "string") : [];
    const names = ids
      .map((id) => cart?.lines.find((line) => line.id === id)?.listing?.name)
      .filter((name): name is string => Boolean(name));
    const when = typeof body.deadline === "string" && parseDeadline(body.deadline)
      ? ` by ${groupDateLabel(body.deadline)}`
      : " in time";
    const who = names.length ? listWords(names) : "An item";
    return split === "none"
      ? `${who} cannot be ready${when}, so these cannot go together. Keep separate deliveries, or choose a later date.`
      : `${who} cannot be ready${when}. Choose a later date for ${names.length > 1 ? "them" : "it"}.`;
  }
  return userFacingError(error, "GRIDGO could not change how this shop delivers. Try again in a moment.");
}

function listWords(words: string[]): string {
  if (words.length < 2) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function positiveInt(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * What a match must carry once the basket has something in it.
 *
 * The basket goes with the match so GRIDGO can recheck a shop's queue with
 * what it is already printing for this order, and keep shop identities out of
 * a multi-shop answer. The product keeps its own date (gridgo-client#189) —
 * the basket no longer imposes one. `groupId` asks for more from one group's
 * shop, and is dropped if that group is no longer in the basket.
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
    // Joining a group without a date of its own takes that group's date.
    deadline: jobDeadline ?? (group ? groupDeadlineOf(group, cart) : null),
    ...(group ? { groupId: group.id } : {}),
  };
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
    return `${label} is paused while GRIDGO reviews your refund. The rest of this order carries on.`;
  }
  if (order.refundDisposition === "fulfilled_with_refund") {
    return `Part of ${label}'s share was refunded to you. The rest of this order was not affected.`;
  }
  if (order.state === "cancelled") {
    return order.refundDisposition === "cancelled"
      ? `${label} was cancelled and its share refunded to you on its own. The rest of this order carries on.`
      : `${label} was cancelled. Its share is refunded on its own; the rest of this order carries on.`;
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
