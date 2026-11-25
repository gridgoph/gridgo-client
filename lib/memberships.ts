/**
 * Organization members, as the member sees it (gridgo-client#475): what each
 * state says, which link is an invite, and the perk line wherever money is
 * drawn. Pure.
 *
 * Money rule: GRIDGO decides the perk. It lowers only GRIDGO's own fee, so a
 * small order can save less than the full perk: the perk is always said as
 * "up to", and the amount on an order is the one GRIDGO quoted for it. Nothing
 * here adds or subtracts pesos.
 */

import { ApiError, formatPhp, type MemberPerkLine } from "@/lib/api";
import { CONNECTION_ERROR_MESSAGE, ConnectionError } from "@/lib/connectionError";
import type {
  Membership,
  MembershipMatch,
  MembershipPerk,
  MembershipPerkOffer,
} from "@/lib/membershipsApi";
import { manilaDay } from "@/lib/organization";
import { apiErrorCode } from "@/lib/whoPrints";

export const MY_ORGS_ROUTE = "/my-orgs" as const;
export const JOIN_ORG_ROUTE = "/my-orgs/join" as const;

/** Said once on every screen a person can join from. */
export const MEMBER_PRIVACY_LINE =
  "The officer sees your name and whether you ordered. Never what you printed.";

/* --------------------------------------------------------------------------
   Names and dates
   -------------------------------------------------------------------------- */

/** "Sample Guild", from GRIDGO's "Sample Guild member". */
export function orgName(entry: { label: string }): string {
  return entry.label.replace(/ member$/i, "").trim() || entry.label;
}

/** The organization's full name, only when it adds something to the short one. */
export function orgFullName(entry: { label: string; organizationName: string | null }): string | null {
  const full = entry.organizationName?.trim();
  return full && full.toLowerCase() !== orgName(entry).toLowerCase() ? full : null;
}

/** "a Sample Guild member" / "an Art Circle member". */
export function withArticle(label: string): string {
  return `${/^[aeiou]/i.test(label.trim()) ? "an" : "a"} ${label}`;
}

/** Up to three letters for the organization's tile. */
export function orgInitials(entry: { label: string }): string {
  const name = orgName(entry);
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return name.slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sep 2025" from `2025-09` or `2025-09-14`. */
export function memberSinceLabel(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value ?? "");
  const month = match ? MONTHS[Number(match[2]) - 1] : null;
  return match && month ? `${month} ${match[1]}` : null;
}

/**
 * The last day something counts, from the instant it stops: a perk that ends
 * at midnight on 1 June is good until 31 May.
 */
export function lastDay(validUntil: string | null | undefined): string | null {
  const time = Date.parse(validUntil ?? "");
  return Number.isFinite(time) ? manilaDay(new Date(time - 1).toISOString()) : null;
}

export function ordersWord(count: number): string {
  return count === 1 ? "1 order" : `${count} orders`;
}

/* --------------------------------------------------------------------------
   The perk
   -------------------------------------------------------------------------- */

export function upToLine(perk: { amountMinor: number }): string {
  return `Up to ${formatPhp(perk.amountMinor)} off`;
}

/** What confirming or joining gives, or null when there is nothing to promise. */
export function offerLine(perk: MembershipPerkOffer | null): string | null {
  if (!perk || !perk.budgetAvailable || perk.amountMinor <= 0 || perk.maxOrdersPerTerm <= 0) return null;
  return `${upToLine(perk)} each of ${ordersWord(perk.maxOrdersPerTerm)} this term`;
}

/** "2 of 5 used this term". */
export function usedLine(perk: MembershipPerk): string {
  return `${perk.used} of ${perk.maxOrdersPerTerm} used this term`;
}

/** "3 of 5 left". */
export function leftLine(perk: MembershipPerk): string {
  return `${perk.left} of ${perk.maxOrdersPerTerm} left`;
}

/** Why an active member's perk is not working today, or null when it is. */
export function perkPause(membership: Membership): string | null {
  const { perk } = membership;
  if (!perk) return "No member perk right now. If one starts, it shows here.";
  if (perk.left <= 0) {
    const day = manilaDay(membership.term.endsOn);
    return day
      ? `You used every perk order this term. Your membership stays until ${day}.`
      : "You used every perk order this term. Your membership stays.";
  }
  if (!perk.available) return "The perk is paused right now. Your membership stays, and unused orders are kept.";
  return null;
}

/* --------------------------------------------------------------------------
   My orgs
   -------------------------------------------------------------------------- */

const ORDER: Record<string, number> = { active: 0, pending: 1, expired: 2 };

/** Current memberships, in the order a person needs them. */
export function currentMemberships(memberships: readonly Membership[]): Membership[] {
  return memberships
    .filter((entry) => entry.status in ORDER)
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => ORDER[a.entry.status]! - ORDER[b.entry.status]! || a.index - b.index)
    .map(({ entry }) => entry);
}

/** What GRIDGO or the officer ended. A request the client ended is not news. */
export function endedMemberships(memberships: readonly Membership[]): Membership[] {
  return memberships.filter((entry) => entry.status === "removed" && endedLine(entry) != null);
}

export function endedLine(membership: Membership): string | null {
  switch (membership.removedReason) {
    case "declined":
      return "The officer did not approve this request. If that was a mistake, talk to them and ask again with their link.";
    case "removed_by_officer":
      return "The officer ended this membership. Your past orders stay as they are.";
    case "request_expired":
      return "The term ended before the officer answered. You can ask again.";
    default:
      return null;
  }
}

export function activeMemberships(memberships: readonly Membership[]): Membership[] {
  return memberships.filter((entry) => entry.status === "active");
}

/** Account's one line about My orgs. */
export function myOrgsLine(memberships: readonly Membership[], matches: readonly MembershipMatch[]): string {
  if (matches.length) return `${orgName(matches[0]!)} lists you as a member. Open to confirm`;
  const current = currentMemberships(memberships);
  const first = current[0];
  if (!first) return "Join your org to get member perks on your orders";
  if (current.length > 1) {
    const active = activeMemberships(current).length;
    return active ? `${current.length} orgs · member of ${active}` : `${current.length} orgs`;
  }
  const name = orgName(first);
  if (first.status === "pending") return `${name} · waiting for the officer`;
  if (first.status === "expired") return `${name} · term ended`;
  if (!first.perk) return `${name} · member`;
  return first.perk.left > 0
    ? `${name} · ${upToLine(first.perk).toLowerCase()} · ${leftLine(first.perk)}`
    : `${name} · all perk orders used this term`;
}

/* --------------------------------------------------------------------------
   Invite links
   -------------------------------------------------------------------------- */

const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

/** The invite token in an app path or a link (`/join/<token>`), if it is one. */
export function joinTokenInPath(path: string): string | null {
  // A group print's own invite also ends in `/join/<token>`; it is not this.
  if (/express\/group\/join\//.test(path)) return null;
  const match = /(?:^|\/)join\/([A-Za-z0-9_-]+)(?:[/?#\s]|$)/.exec(path);
  return match && TOKEN.test(match[1]!) ? match[1]! : null;
}

export type JoinText = { ok: true; token: string } | { ok: false; message: string };

/**
 * A pasted link, a whole chat message around it, or the bare code. Checked on
 * the phone, because GRIDGO locks look-ups after a few links that do not work.
 */
export function readJoinText(text: string): JoinText {
  const value = text.trim();
  if (!value) return { ok: false, message: "Paste the link your officer sent." };
  if (/express\/group\/join\//.test(value)) {
    return { ok: false, message: "This link is for a group print. Open it on its own, then ask your officer for the member link." };
  }
  const token = joinTokenInPath(value) ?? (TOKEN.test(value) ? value : null);
  return token
    ? { ok: true, token }
    : { ok: false, message: "That is not a member link. Copy the whole link and paste it again." };
}

/* --------------------------------------------------------------------------
   Refusals
   -------------------------------------------------------------------------- */

/** The time look-ups open again, as "3:45 PM" in Manila. */
function retryClock(error: unknown): string | null {
  if (!(error instanceof ApiError) || typeof error.body !== "object" || !error.body) return null;
  const at = Date.parse(String((error.body as { retryAt?: unknown }).retryAt ?? ""));
  if (!Number.isFinite(at)) return null;
  const local = new Date(at + 8 * 3_600_000);
  const hour = local.getUTCHours();
  return `${hour % 12 || 12}:${String(local.getUTCMinutes()).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export function memberErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConnectionError) return CONNECTION_ERROR_MESSAGE;
  switch (apiErrorCode(error)) {
    case "member_invite_not_found":
      return "This link no longer works. Ask your officer for the newest link or QR.";
    case "member_join_rate_limited": {
      const at = retryClock(error);
      return at
        ? `Too many links were tried. You can try again at ${at}.`
        : "Too many links were tried. Wait 15 minutes, then try again.";
    }
    case "member_requests_full":
      return "This organization has many requests waiting. Try again in a few days.";
    case "member_match_not_found":
      return "This invitation has closed. Ask your officer for the link or QR to join.";
    case "member_match_rate_limited":
      return "GRIDGO is still checking. Wait a few minutes, then try again.";
    case "clerk_unavailable":
      return "GRIDGO could not check your email just now. Try again in a moment.";
    case "membership_not_found":
      return "This membership has already ended.";
    default:
      return fallback;
  }
}

/* --------------------------------------------------------------------------
   Money rows
   -------------------------------------------------------------------------- */

type PerkSource =
  | { memberPerkMinor?: number | null; memberPerk?: MemberPerkLine | null; memberPerkLabel?: string | null }
  | null
  | undefined;

export const MEMBER_PERK_LABEL = "Member perk";

/** The perk GRIDGO took off something; 0 when absent or not positive. */
export function memberPerkOf(source: PerkSource): number {
  const minor = source?.memberPerkMinor;
  return typeof minor === "number" && Number.isFinite(minor) && minor > 0 ? minor : 0;
}

/** The line's name: "Sample Guild member". */
export function memberPerkLabel(source: PerkSource): string {
  return source?.memberPerk?.label?.trim() || source?.memberPerkLabel?.trim() || MEMBER_PERK_LABEL;
}

/** "Member perk 3 of 5 this term, applied automatically. 2 left after this order." */
export function memberPerkNote(source: PerkSource): string | null {
  const perk = source?.memberPerk;
  if (!perk || !memberPerkOf(source) || !perk.maxOrdersPerTerm) return null;
  const left = Math.max(0, perk.maxOrdersPerTerm - perk.useNumber);
  const after = left === 0 ? "This is your last one." : `${left} left after this order.`;
  return `Member perk ${perk.useNumber} of ${perk.maxOrdersPerTerm} this term, applied automatically. ${after}`;
}

/** What checkout sends back so GRIDGO can refuse a perk that moved; only when the quote carries one. */
export function expectedMemberPerk(quote: PerkSource): number | undefined {
  return typeof quote?.memberPerkMinor === "number" ? quote.memberPerkMinor : undefined;
}

export const MEMBER_PERK_CHANGED = "member_perk_changed";

/**
 * `409 member_perk_changed`: nothing was placed. The new total is read again
 * from GRIDGO; `totalMinor` is that fresh quote's, never worked out here.
 */
export function memberPerkChangedMessage(
  quote: (NonNullable<PerkSource> & { totalMinor?: number | null }) | null | undefined,
  paidByQr: boolean,
): string {
  const off = memberPerkOf(quote);
  const total = quote?.totalMinor;
  const what =
    total == null
      ? "Your member perk changed while you were checking out, so your total changed."
      : off
        ? `Your member perk is now ${formatPhp(off)} on this order, so your total is ${formatPhp(total)}.`
        : `Your member perk can no longer be used on this order, so your total is ${formatPhp(total)}.`;
  return `${what} Your order was not placed. Check the new total, then place it again.${
    paidByQr ? " Already paid? Message GRIDGO before you pay again." : ""
  }`;
}

/* --------------------------------------------------------------------------
   Inbox and push
   -------------------------------------------------------------------------- */

/** Notices only a member receives. `membership.confirmed` also goes to the organization. */
const MEMBER_NOTICES: ReadonlySet<string> = new Set([
  "membership.approved",
  "membership.declined",
  "membership.removed",
  "membership.renewed",
  "membership.date_edited",
  "membership.expired",
  "membership.request_expired",
]);

/** A push carries only its type, so it opens My orgs only when the type is the member's alone. */
export function isMemberNotification(type: string | null | undefined): boolean {
  return type != null && MEMBER_NOTICES.has(type);
}

/** An inbox row for the member, not the organization's own copy of the event. */
export function opensMyOrgs(notification: {
  type?: string | null;
  userId?: string | null;
  organizationUserId?: string | null;
}): boolean {
  if (isMemberNotification(notification.type)) return true;
  return (
    notification.type === "membership.confirmed" &&
    Boolean(notification.organizationUserId) &&
    notification.organizationUserId !== notification.userId
  );
}
