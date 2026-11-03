/**
 * Home's smart tile (client#335; gridgo-api `docs/CLIENT_HOME_API.md#smart-tile-summary`).
 *
 * Pure. GRIDGO decides which state applies (`tile`, first that applies:
 * missions → active order → unused tester voucher → invite); this module only
 * turns that answer into what the tile draws, and falls back honestly when the
 * summary could not be read. The tile is the same size in every state, so the
 * Home layout never moves when the state changes.
 */

import type { HomeActiveOrder, HomeSummary, Order, User } from "@/lib/api";
import { canInvite, foundingTesterView, FOUNDING_TESTER_LABEL, INVITE_ROUTE, INVITE_TITLE } from "@/lib/foundingTester";
import { formatRelativeTime } from "@/lib/relativeTime";
import { stubAmount } from "@/lib/vouchers";

export const FOUNDING_TESTER_ROUTE = "/founding-tester";
export const VOUCHERS_ROUTE = "/vouchers";
export const ORDERS_ROUTE = "/(tabs)/orders";

export type SmartTileView =
  | { kind: "missions"; done: number; total: number; href: string; label: string }
  | {
      kind: "active_order";
      orderId: string;
      headline: string;
      detail: string | null;
      step: number;
      stepCount: number;
      /** Other active orders beyond this one. */
      more: number;
      /** The client owes a payment before this order can move. */
      needsPayment: boolean;
      href: string;
      label: string;
    }
  | { kind: "tester_voucher"; amount: string; daysLeft: number; href: string; label: string }
  | { kind: "invite"; href: string; label: string }
  | { kind: "orders"; href: string; label: string };

const STEP_COUNT = 4;

/** The four steps, as the tile names them. Step 3 says what a pick-up order is waiting for. */
export function activeOrderHeadline(order: Pick<HomeActiveOrder, "step" | "stepKey" | "fulfillmentMode" | "awaitingPayment">): string {
  if (order.awaitingPayment) return "Payment due";
  switch (order.step) {
    case 1:
      return "Order placed";
    case 2:
      return "Printing";
    case 3:
      return order.fulfillmentMode === "pickup" ? "Ready for pickup" : "On the way";
    case 4:
      return "Delivered";
    default:
      return "In progress";
  }
}

/** "Wed, 4 Nov" in Davao time — the date the client was promised. */
export function shortDavaoDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", day: "numeric", month: "short" });
}

/**
 * The one line under the step: the promise the client was told, how long it
 * has sat in this state, or when it was delivered. GRIDGO publishes no ETA,
 * so nothing here counts down to an arrival.
 */
export function activeOrderDetail(order: Pick<HomeActiveOrder, "awaitingPayment" | "time">, now: number): string | null {
  if (order.awaitingPayment) return "Tap to pay";
  const time = order.time;
  if (!time?.at) return null;
  if (time.kind === "promised") {
    const day = shortDavaoDate(time.at);
    return day ? `Ready by ${day}` : null;
  }
  if (time.kind === "delivered") return `Delivered ${formatRelativeTime(time.at, now).toLowerCase()}`;
  if (time.kind === "since") return `Updated ${formatRelativeTime(time.at, now).toLowerCase()}`;
  return null;
}

function clampStep(step: unknown): number {
  return typeof step === "number" && Number.isFinite(step) ? Math.min(STEP_COUNT, Math.max(1, Math.round(step))) : 1;
}

function missionsTile(done: number, total: number): SmartTileView {
  return {
    kind: "missions",
    done,
    total,
    href: FOUNDING_TESTER_ROUTE,
    label: `${FOUNDING_TESTER_LABEL}, ${done} of ${total} steps done`,
  };
}

const INVITE_TILE: SmartTileView = { kind: "invite", href: INVITE_ROUTE, label: `${INVITE_TITLE}. You each get a voucher when they finish the steps` };
const ORDERS_TILE: SmartTileView = { kind: "orders", href: ORDERS_ROUTE, label: "Your orders" };

/**
 * What the smart tile shows.
 *
 * With a summary, GRIDGO's `tile` decides; a state whose object is missing
 * falls to the next one rather than drawing an empty tile. Without one (the
 * read failed, or an API from before the route), the account's own Founding
 * Tester projection still shows the missions, then the invite, then a way
 * into Orders — never a guessed order or voucher.
 */
export function smartTileView(summary: HomeSummary | null, user: Pick<User, "foundingTester"> | null | undefined, now: number = Date.now()): SmartTileView {
  if (summary) {
    const order = summary.activeOrder;
    const voucher = summary.testerVoucher;
    const states = [summary.tile, "active_order", "tester_voucher", "invite"];
    for (const state of states) {
      if (state === "missions" && summary.missions) {
        const total = summary.missions.total ?? 5;
        const done = Math.max(0, Math.min(total, summary.missions.completedCount ?? 0));
        if (done < total) return missionsTile(done, total);
      }
      if (state === "active_order" && order) {
        const headline = activeOrderHeadline(order);
        const more = Math.max(0, (summary.activeOrderCount ?? 1) - 1);
        return {
          kind: "active_order",
          orderId: order.orderId,
          headline,
          detail: activeOrderDetail(order, now),
          step: clampStep(order.step),
          stepCount: STEP_COUNT,
          more,
          needsPayment: order.awaitingPayment === true,
          href: `/order/${encodeURIComponent(order.orderId)}`,
          label: `Your order, ${headline}${more ? `, and ${more} more` : ""}`,
        };
      }
      if (state === "tester_voucher" && voucher) {
        const amount = stubAmount(voucher.valueMinor);
        const daysLeft = Math.max(0, Math.floor(voucher.daysLeft ?? 0));
        return {
          kind: "tester_voucher",
          amount,
          daysLeft,
          // The mission's own voucher is shown with its code on the Founding
          // Tester screen; any other programme voucher lives in the wallet.
          href: voucher.kind === "mission" ? FOUNDING_TESTER_ROUTE : VOUCHERS_ROUTE,
          label: `Tester voucher, ${amount} off, ${daysLeftLine(daysLeft)}`,
        };
      }
      if (state === "invite") return INVITE_TILE;
    }
    return INVITE_TILE;
  }
  const tester = foundingTesterView(user);
  if (tester?.kind === "missions" && !tester.complete) return missionsTile(tester.doneCount, tester.steps.length);
  if (canInvite(user)) return INVITE_TILE;
  return ORDERS_TILE;
}

export function daysLeftLine(days: number): string {
  if (days <= 0) return "expires today";
  return days === 1 ? "1 day left" : `${days} days left`;
}

/** Whether the Report a bug tile carries the reward tag, and its amount. */
export function bugRewardTag(summary: HomeSummary | null): string | null {
  const bug = summary?.bugReport;
  if (!bug?.rewardAvailable) return null;
  return Number.isSafeInteger(bug.amountMinor) && bug.amountMinor > 0 ? stubAmount(bug.amountMinor) : null;
}

/** The client's most recent job, the one Home's Reorder fills in. Drafts never count. */
export function lastOrder<T extends Pick<Order, "state" | "createdAt">>(orders: readonly T[]): T | null {
  let newest: T | null = null;
  for (const order of orders) {
    if (order.state === "draft") continue;
    if (!newest || (order.createdAt ?? "") > (newest.createdAt ?? "")) newest = order;
  }
  return newest;
}
