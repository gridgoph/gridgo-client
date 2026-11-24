/**
 * Group Express (gridgo-client#450/#451/#452; gridgo-api
 * `docs/GROUP_EXPRESS_API.md`). Pure rules only: which phase a group is in,
 * what each person is told they owe the host, the countdown wording, and the
 * plain words for every refusal. Every amount, limit and time comes from
 * GRIDGO's own answer; nothing here prices or times anything itself.
 */

import type {
  ExpressGroup,
  ExpressGroupAmount,
  ExpressGroupFile,
  ExpressGroupInvite,
  ExpressGroupTracking,
} from "@/lib/api";
import type { ExpressPrint } from "@/lib/express";

/** A group order update (`group_*`); its Alert carries the `groupId`. */
export function isGroupNotification(type: string | null | undefined): boolean {
  return typeof type === "string" && type.startsWith("group_");
}

/** The time limits `POST /express/groups` takes; GRIDGO defaults to 30. */
export const GROUP_TIME_LIMITS = [15, 30, 60] as const;
export type GroupTimeLimit = (typeof GROUP_TIME_LIMITS)[number];
export const DEFAULT_GROUP_TIME_LIMIT: GroupTimeLimit = 30;

/** Express documents a group takes: A3 is priced per shop and is not in group orders. */
export const GROUP_PAPERS = ["a4", "short", "long"] as const;

export type GroupPhase = "open" | "checkout" | "ordered" | "cancelled" | "completed";

/** Where the group stands, from GRIDGO's own state. An unknown state reads as ordered once an order exists. */
export function groupPhase(group: Pick<ExpressGroup, "state" | "tracking">): GroupPhase {
  if (group.state === "open") return "open";
  if (group.state === "checkout_open") return "checkout";
  if (group.state === "cancelled") return "cancelled";
  if (group.state === "completed") return "completed";
  return "ordered";
}

export function isHost(group: Pick<ExpressGroup, "host">, userId: string | null | undefined): boolean {
  return Boolean(userId) && group.host.id === userId;
}

/** An open or checkout-open group: the one a person can be in at a time. */
export function isLiveGroup(group: Pick<ExpressGroup, "state">): boolean {
  return group.state === "open" || group.state === "checkout_open" || group.state === "ordered";
}

/** The group a person should be sent back to: open first, then one being paid, then one in flight. */
export function currentGroup(groups: ExpressGroup[]): ExpressGroup | null {
  const rank = (group: ExpressGroup) =>
    group.state === "open" ? 0 : group.state === "checkout_open" ? 1 : group.state === "ordered" ? 2 : 3;
  const live = groups.filter((group) => rank(group) < 3);
  return live.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/** "12:04" left, "1:02:00" past an hour; null once the time has passed. */
export function timeLeft(target: string | null | undefined, now: number): string | null {
  if (!target) return null;
  const left = Date.parse(target) - now;
  if (!Number.isFinite(left) || left <= 0) return null;
  const seconds = Math.ceil(left / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** Share of the time limit still left, 0–1, for the countdown bar. */
export function timeShare(start: string | null | undefined, end: string | null | undefined, now: number): number {
  if (!start || !end) return 0;
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return Math.min(1, Math.max(0, (to - now) / (to - from)));
}

/** "2:15 PM" in Davao time. */
export function clockTime(at: string | null | undefined): string | null {
  if (!at) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

export function peopleLine(count: number): string {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

export function pagesLine(count: number): string {
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

export function filesLine(count: number): string {
  return `${count} ${count === 1 ? "file" : "files"}`;
}

export function modeLine(mode: string): string {
  return mode === "delivery" ? "Delivered to the host" : "The host picks it up";
}

/** First name, or the whole name when it has one word. Never an email. */
export function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed || trimmed.includes("@")) return "Someone";
  return trimmed.split(/\s+/)[0];
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length || parts[0].includes("@")) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * What one person is told about their share. `pending` is GRIDGO's own
 * answer when no printer can quote right now: pages count, money waits.
 */
export type ShareView =
  | { kind: "none" }
  | { kind: "pending"; pages: number }
  | {
      kind: "priced";
      pages: number;
      printsMinor: number;
      deliveryMinor: number;
      owedMinor: number;
    };

export function shareView(amount: Pick<ExpressGroupAmount, "fileCount" | "pageCount" | "printSubtotalMinor" | "deliveryShareMinor" | "amountOwedMinor"> | null | undefined): ShareView {
  if (!amount || !amount.fileCount) return { kind: "none" };
  if (amount.amountOwedMinor == null || amount.printSubtotalMinor == null) {
    return { kind: "pending", pages: amount.pageCount ?? 0 };
  }
  return {
    kind: "priced",
    pages: amount.pageCount ?? 0,
    printsMinor: amount.printSubtotalMinor,
    deliveryMinor: amount.deliveryShareMinor ?? 0,
    owedMinor: amount.amountOwedMinor,
  };
}

/**
 * The delivery share each printing person sees, and the full fare it comes
 * from (struck through on screen). Read from GRIDGO's own member rows: a
 * member's row is the share, the host's row absorbs the rounding.
 */
export function deliveryShareLine(
  group: Pick<ExpressGroup, "fulfillmentMode" | "printingPeople" | "deliveryFeeMinor" | "members" | "host" | "me">,
): { shareMinor: number; fareMinor: number | null } | null {
  if (group.fulfillmentMode !== "delivery") return null;
  const rows = group.members ?? [group.me];
  const member = rows.find((row) => row.userId !== group.host.id && row.fileCount > 0 && row.deliveryShareMinor != null);
  const share = member?.deliveryShareMinor ?? (group.me.fileCount > 0 && group.me.userId !== group.host.id ? group.me.deliveryShareMinor : null);
  if (share == null) return null;
  return { shareMinor: share, fareMinor: group.deliveryFeeMinor ?? null };
}

/** Prints to the group's files list: exactly the fields the group endpoint takes. */
export function groupFiles(prints: ExpressPrint[]): ExpressGroupFile[] {
  return prints.map((print) => ({
    fileId: print.fileId,
    copies: print.copies,
    ...(print.pageRange ? { pageRange: print.pageRange } : {}),
    paper: print.paper === "a3" ? "a4" : print.paper,
    colour: print.colour,
    sides: print.sides,
    layout: print.layout,
    ...(print.note.trim() ? { note: print.note.trim() } : {}),
    acceptedWarnings: print.acceptedWarnings,
  }));
}

/** The app link an invite carries. `base` is the app's own URL for `/` (scheme or Expo Go). */
export function inviteLink(base: string, token: string): string {
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}express/group/join/${encodeURIComponent(token)}`;
}

/** The share-sheet text: who, what, until when, and how to get the app. */
export function inviteMessage(input: {
  hostName: string;
  link: string;
  closesAt: string;
  mode: string;
  downloadUrl: string | null;
}): string {
  const time = clockTime(input.closesAt);
  const lines = [
    `${firstName(input.hostName)} is printing with GRIDGO. Add your files to the group${time ? ` before ${time}` : ""} and share one ${input.mode === "delivery" ? "delivery fee" : "pickup"}.`,
    input.link,
  ];
  if (input.downloadUrl) lines.push(`No GRIDGO app yet? Get it here first: ${input.downloadUrl}`);
  return lines.join("\n\n");
}

/** Why a group ended, in the words a member can act on. */
export function cancelReasonLine(reason: string | null | undefined): string {
  switch (reason) {
    case "not_paid":
      return "The host did not pay in time, so nothing was ordered.";
    case "host_cancelled":
      return "The host cancelled the group. Nothing was printed.";
    case "three_declines":
      return "Three shops could not take it, so GRIDGO cancelled it.";
    case "no_shop_in_zone":
      return "No shop in the same area could take it, so GRIDGO cancelled it.";
    default:
      return "This group order was cancelled.";
  }
}

/** Plain words for every refusal the group routes send. */
export function groupErrorLine(code: string | null): string | null {
  switch (code) {
    case "group_closed":
      return "This group is closed. Ask the host if they are starting another one.";
    case "group_full":
      return "This group is full.";
    case "group_not_found":
      return "This invite link does not work. Ask the host to share it again.";
    case "group_already_open":
      return "You are already in an open group. Finish or leave it first.";
    case "group_locked":
      return "Files are locked. The host is checking out.";
    case "group_membership_required":
      return "You are no longer in this group. Your files were not ordered.";
    case "group_host_required":
      return "Only the host can do that.";
    case "group_host_cannot_leave":
      return "The host cannot leave. Cancel the group instead.";
    case "group_files_required":
      return "Nobody has added files yet.";
    case "group_pickup_shop_required":
      return "Choose a shop to pick up from.";
    case "group_preview_required":
      return "Get the price again, then pay.";
    case "group_cash_limit_exceeded":
      return "Cash is only for smaller orders. Pay by QR instead.";
    case "group_shop_decision_expired":
      return "Time to choose ran out. GRIDGO kept the new shop.";
    case "group_order_cancellation_required":
      return "This order is already placed. Use the order screen to cancel it.";
    case "invalid_group_backup":
      return "Check the backup name and phone number.";
    case "invalid_group_setup":
      return "Choose pick up or delivery, and a place.";
    case "invalid_express_files":
      return "One of your files has a setting GRIDGO cannot print for a group. A4, Short or Long only.";
    case "file_not_ready":
      return "One of your files is not ready. Upload it again.";
    case "express_shop_unavailable":
      return "No shop can print these right now. Try again in a minute.";
    case "already_rated":
      return "You already rated this order.";
    default:
      return null;
  }
}

/** The six stops everyone follows, from the order's own state. */
export function trackingStops(mode: string): string[] {
  return mode === "delivery"
    ? ["Placed", "Accepted", "Printing", "Ready", "On the way", "Delivered"]
    : ["Placed", "Accepted", "Printing", "Ready", "Picked up"];
}

/**
 * Where on the stops the order stands. Null when cancelled. gridgo-api's
 * group `status` is the Express status; `tracking.state` is the order's.
 */
export function trackingIndex(status: string, state: string | null | undefined, mode: string): number | null {
  if (status === "cancelled" || state === "cancelled") return null;
  const delivery = mode === "delivery";
  if (status === "picked_up") return 4;
  if (status === "delivered") return delivery ? 5 : 4;
  if (status === "ready") {
    if (delivery && state && ["picked_up", "out_for_delivery"].includes(state)) return 4;
    return 3;
  }
  if (status === "printing") return 2;
  if (status === "accepted") return 1;
  return 0;
}

/** One line under the stops, for the person reading. Only the host collects. */
export function trackingLine(index: number | null, mode: string, host: boolean, hostName: string): string {
  const who = firstName(hostName);
  if (index == null) return "This group order was cancelled.";
  const delivery = mode === "delivery";
  switch (index) {
    case 0:
      return "GRIDGO is checking the payment and files, then sends it to the shop.";
    case 1:
      return "The shop accepted. Printing starts soon.";
    case 2:
      return "The shop is printing everyone's files, packed per person.";
    case 3:
      return delivery
        ? "Ready. A rider is coming for it."
        : host
          ? "Ready. Show your pickup code at the shop."
          : `Ready. ${who} is picking it up for everyone.`;
    case 4:
      return delivery
        ? host
          ? "On the way to you. Have your code ready."
          : `On the way to ${who}.`
        : host
          ? "Picked up. Hand everyone their prints."
          : `${who} has everyone's prints.`;
    default:
      return host ? "Delivered. Hand everyone their prints." : `Delivered to ${who}.`;
  }
}

/** An invite that can still be joined, said in one line. */
export function inviteLine(invite: Pick<ExpressGroupInvite, "people" | "fulfillmentMode">): string {
  return `${peopleLine(invite.people)} in so far · ${modeLine(invite.fulfillmentMode)}`;
}

/** Rider location for the shared map; members and host see the same rider. */
export function riderPoint(tracking: Pick<ExpressGroupTracking, "ping"> | null): { lat: number; lng: number } | null {
  const ping = tracking?.ping;
  if (!ping || !Number.isFinite(ping.lat) || !Number.isFinite(ping.lng)) return null;
  return { lat: ping.lat, lng: ping.lng };
}

/**
 * A group Alert as the inbox draws it. GRIDGO writes the body with ISO times
 * and "PHP" amounts; the inbox says them the way the rest of the app does.
 */
export function groupNotificationCopy(notification: { title: string; body: string }): { title: string; body: string; hint: string } {
  const body = notification.body
    .replace(/Group cancelled: ([a-z_]+)\.?/, (_, code: string) => `Group cancelled. ${cancelReasonLine(code)}`)
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z/g, (iso) => clockTime(iso) ?? iso)
    .replace(/PHP (-?\d[\d,]*\.\d{2})/g, (_, amount: string) => `₱${amount}`);
  return { title: notification.title || "Group order", body, hint: "Opens the group" };
}
