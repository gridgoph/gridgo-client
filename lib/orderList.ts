/**
 * Finding one job in a list of many.
 *
 * The orders tab was two piles in whatever order the platform returned them,
 * which works until a client has printed more than a handful of things. These
 * are the three questions people actually arrive with — what needs me, where is
 * the flyers job, what have I not paid for — answered with pure functions so
 * the screen holds no logic and the tests hold no rendering.
 *
 * Everything is computed on the phone against the list already loaded. There is
 * no server-side query behind any of it, so nothing here may be slow enough to
 * need one.
 */

import type { Order } from "@/lib/api";
import { orderNeedsClient, orderTotalMinor } from "@/lib/orderState";
import { balanceDue, downpaymentDue } from "@/lib/payment";

export type OrderFilter = "all" | "needs_you" | "active" | "payment_due" | "done";

/**
 * How the list is ordered.
 *
 * `recent` is the default and the one most people mean by "newest": the job
 * something last happened to, not the job placed last. An order sent three
 * weeks ago that a supplier accepted this morning is the one worth seeing
 * first, and sorting by when it was created buried it under quieter jobs sent
 * after it. `newest` keeps the other reading for when it is genuinely wanted.
 */
export type OrderSort = "recent" | "newest" | "oldest" | "price";

export const ORDER_FILTERS: readonly OrderFilter[] = [
  "all",
  "needs_you",
  "payment_due",
  "active",
  "done",
] as const;

export const ORDER_SORTS: readonly OrderSort[] = [
  "recent",
  "newest",
  "oldest",
  "price",
] as const;

export const DEFAULT_ORDER_SORT: OrderSort = "recent";

/**
 * Below this the controls cost more than they give.
 *
 * Three jobs are read, not searched. A filter bar over them is chrome around an
 * answer already on screen.
 */
export const ORDER_CONTROLS_MIN = 4;

/** Terminal states: nothing about these is still moving. */
const DONE_STATES = ["completed", "payout_released", "cancelled"];

export function isDoneOrder(order: Order): boolean {
  return DONE_STATES.includes(order.state);
}

/** Money the client still owes and has not sent yet. */
export function hasPaymentDue(order: Order): boolean {
  return downpaymentDue(order) || balanceDue(order);
}

export function filterLabel(filter: OrderFilter): string {
  switch (filter) {
    case "all":
      return "All";
    case "needs_you":
      return "Needs you";
    case "payment_due":
      return "Payment due";
    case "active":
      return "Active";
    case "done":
      return "Done";
  }
}

export function sortLabel(sort: OrderSort): string {
  switch (sort) {
    case "recent":
      return "Recently updated";
    case "newest":
      return "Newest first";
    case "oldest":
      return "Oldest first";
    case "price":
      return "Highest price";
  }
}

/** One line under each option, because two of the four sound alike. */
export function sortBlurb(sort: OrderSort): string {
  switch (sort) {
    case "recent":
      return "Whatever moved last";
    case "newest":
      return "The job you sent most recently";
    case "oldest":
      return "The job you have been waiting on longest";
    case "price":
      return "Dearest job first";
  }
}

export function matchesFilter(order: Order, filter: OrderFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needs_you":
      return orderNeedsClient(order);
    case "payment_due":
      return hasPaymentDue(order);
    case "active":
      return !isDoneOrder(order);
    case "done":
      return isDoneOrder(order);
  }
}

/** How many jobs each filter would show, for the counts on the chips. */
export function filterCounts(orders: Order[]): Record<OrderFilter, number> {
  const counts = {} as Record<OrderFilter, number>;
  for (const filter of ORDER_FILTERS) {
    counts[filter] = orders.filter((order) => matchesFilter(order, filter)).length;
  }
  return counts;
}

/**
 * What a job is, in the words a client would type looking for it.
 *
 * The title first, then the specification they chose — "A5", "matte_150gsm".
 * Raw platform codes are included on purpose: they are what the card itself
 * shows, so a client copying what they can see must find the job.
 */
function haystack(order: Order): string {
  return [order.title, order.size, order.material, order.finish, order.artworkName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesQuery(order: Order, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const hay = haystack(order);
  // Every word has to appear, so "a5 flyers" narrows rather than widens.
  return needle.split(/\s+/).every((word) => hay.includes(word));
}

function createdMs(order: Order): number {
  const parsed = Date.parse(order.createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * When something last happened to this job.
 *
 * Falls back to when it was placed, because an order nothing has happened to
 * yet was last touched when it was sent. Without the fallback a malformed or
 * missing timestamp would sink a live job to the bottom of the list it is
 * meant to lead.
 */
function updatedMs(order: Order): number {
  const parsed = Date.parse(order.updatedAt);
  return Number.isNaN(parsed) ? createdMs(order) : parsed;
}

export function sortOrders(orders: Order[], sort: OrderSort): Order[] {
  const sorted = [...orders];
  switch (sort) {
    case "recent":
      return sorted.sort((a, b) => updatedMs(b) - updatedMs(a) || createdMs(b) - createdMs(a));
    case "newest":
      return sorted.sort((a, b) => createdMs(b) - createdMs(a));
    case "oldest":
      return sorted.sort((a, b) => createdMs(a) - createdMs(b));
    case "price":
      // An unpriced job has no place at either end of a price list, so it
      // falls to the bottom rather than reading as free.
      return sorted.sort((a, b) => {
        const left = orderTotalMinor(a);
        const right = orderTotalMinor(b);
        if (left == null && right == null) return updatedMs(b) - updatedMs(a);
        if (left == null) return 1;
        if (right == null) return -1;
        return right - left;
      });
  }
}

export function visibleOrders(
  orders: Order[],
  { filter, sort, query }: { filter: OrderFilter; sort: OrderSort; query: string },
): Order[] {
  return sortOrders(
    orders.filter((order) => matchesFilter(order, filter) && matchesQuery(order, query)),
    sort,
  );
}

/** What an empty result should say, which depends on why it is empty. */
export function emptyResultBody(filter: OrderFilter, query: string): string {
  if (query.trim()) return `Nothing here matches “${query.trim()}”. Try fewer words.`;
  switch (filter) {
    case "needs_you":
      return "Nothing is waiting on you. Every job is with GRIDGO, a shop or a rider.";
    case "payment_due":
      return "Nothing is unpaid. Every job you have sent is settled up to its current step.";
    case "done":
      return "No finished jobs yet.";
    default:
      return "No jobs here.";
  }
}
