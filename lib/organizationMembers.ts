/**
 * Organization members, from the officer's chair: words, dates and the small
 * rules the screens share (gridgo-client#474, gridgo-api
 * `docs/ORGANIZATION_MEMBERS_API.md`). Pure.
 *
 * Two truths the wording keeps:
 *
 * - GRIDGO never says which listed people already have an account, so nothing
 *   here counts them.
 * - The perk is at most its amount. A small order may save less, so the amount
 *   is always "up to".
 */

import { ApiError, formatPhp } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { lastDay, memberSinceLabel } from "@/lib/memberships";
import { manilaDay } from "@/lib/organization";
import type {
  MemberListCheck,
  MembersSummary,
  MemberSource,
  MemberTerm,
  OrganizationEvent,
  OrganizationMember,
  Partnership,
} from "@/lib/organizationMembersApi";

export const MEMBERS_ROUTE = "/organization/members" as const;
export const MEMBER_INVITE_ROUTE = "/organization/invite" as const;
export const MEMBER_LIST_ROUTE = "/organization/member-list" as const;
export const MEMBER_LIST_ROW_ROUTE = "/organization/member-list-row" as const;
export const MEMBER_WAITING_ROUTE = "/organization/waiting" as const;
export const MEMBER_RENEW_ROUTE = "/organization/renew" as const;
export const PARTNERSHIP_ROUTE = "/organization/partnership" as const;
export const EVENTS_ROUTE = "/organization/events" as const;
export const EVENT_EDIT_ROUTE = "/organization/event-edit" as const;

export const approveRoute = (id: string) => ({ pathname: "/organization/approve/[id]", params: { id } }) as const;
export const memberRoute = (id: string) => ({ pathname: "/organization/member/[id]", params: { id } }) as const;
export const eventRoute = (id: string) => ({ pathname: "/organization/event/[id]", params: { id } }) as const;

export const PARTNER_BADGE = "GRIDGO Partner Org";

/** `POST /members/renew` takes 500 at most. */
export const RENEW_LIMIT = 500;

/* --------------------------------------------------------------------------
   Dates
   -------------------------------------------------------------------------- */

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function memberSinceLine(value: string | null): string {
  const since = memberSinceLabel(value);
  return since ? `Member since ${since}` : "Member since date not set";
}

/** Somebody who was a member in an earlier term, and whose date comes back with them. */
export function returningLine(value: string | null): string | null {
  const since = memberSinceLabel(value);
  return since ? `Was a member before, since ${since}` : null;
}

/** The month and year GRIDGO is in, read in Manila. */
export function manilaMonth(now: Date = new Date()): { year: number; month: number } {
  const day = new Date(now.getTime() + 8 * 3_600_000).toISOString();
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

/** How far back the year picker goes. Enough for an adviser who joined as a student. */
const YEARS_BACK = 40;

export function memberYearOptions(now: Date = new Date()): { value: string; label: string }[] {
  const { year } = manilaMonth(now);
  return Array.from({ length: YEARS_BACK + 1 }, (_, index) => {
    const value = String(year - index);
    return { value, label: value };
  });
}

/** The months that have started: a joining date is never in the future. */
export function memberMonthOptions(year: string, now: Date = new Date()): { value: string; label: string }[] {
  const current = manilaMonth(now);
  const last = Number(year) === current.year ? current.month : 12;
  return MONTH_NAMES.slice(0, last).map((label, index) => ({ value: String(index + 1).padStart(2, "0"), label }));
}

export type MonthPick = { year: string; month: string };

export const EMPTY_PICK: MonthPick = { year: "", month: "" };

/** What the pickers start on: somebody's real date, or nothing. Never today. */
export function pickFrom(value: string | null | undefined): MonthPick {
  const match = /^(\d{4})-(\d{2})/.exec(value ?? "");
  return match ? { year: match[1]!, month: match[2]! } : EMPTY_PICK;
}

export function pickValue(pick: MonthPick, now: Date = new Date()): string | null {
  if (!/^\d{4}$/.test(pick.year) || !/^(0[1-9]|1[0-2])$/.test(pick.month)) return null;
  const current = manilaMonth(now);
  const year = Number(pick.year);
  if (year > current.year || (year === current.year && Number(pick.month) > current.month)) return null;
  return `${pick.year}-${pick.month}`;
}

/** What is still missing from the pickers, said as the thing to do. */
export function pickProblem(pick: MonthPick, now: Date = new Date()): string | null {
  if (pickValue(pick, now)) return null;
  if (!pick.month && !pick.year) return "Choose the month and year they joined.";
  return pick.month ? "Choose the year they joined." : "Choose the month they joined.";
}

/** A year change can leave a month that has not happened yet; it is cleared, never moved. */
export function withYear(pick: MonthPick, year: string, now: Date = new Date()): MonthPick {
  const allowed = memberMonthOptions(year, now).some((option) => option.value === pick.month);
  return { year, month: allowed ? pick.month : "" };
}

/** "Asked today", "Asked yesterday", "Asked 12 Nov 2026", read in Manila. */
export function askedLine(requestedAt: string, source: MemberSource, now: Date = new Date()): string {
  const day = (time: number) => Math.floor((time + 8 * 3_600_000) / 86_400_000);
  const asked = Date.parse(requestedAt);
  const age = Number.isFinite(asked) ? day(now.getTime()) - day(asked) : null;
  const when = age === 0 ? "Asked today" : age === 1 ? "Asked yesterday" : `Asked ${manilaDay(requestedAt) ?? "earlier"}`;
  return `${when} · ${source === "qr" ? "by QR" : source === "link" ? "by link" : "from your list"}`;
}

export function termEndsLine(term: MemberTerm): string {
  return `Term ends ${manilaDay(term.endsOn) ?? term.endsOn}`;
}

/** 18:00 to 20:00 Manila is when GRIDGO emails invites. */
export function inviteEvening(now: Date = new Date()): string {
  const hour = new Date(now.getTime() + 8 * 3_600_000).getUTCHours();
  return hour < 20 ? "this evening, between 6 and 8 PM" : "tomorrow evening, between 6 and 8 PM";
}

/* --------------------------------------------------------------------------
   Counts in words
   -------------------------------------------------------------------------- */

export function countOf(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-PH")} ${count === 1 ? one : many}`;
}

export const memberCountLine = (count: number) => countOf(count, "member", "members");
export const termsLine = (count: number) => countOf(count, "term", "terms");

/** Account's Members row: what is there, with what waits on the officer named. */
export function membersRowDetail(summary: MembersSummary | null): string {
  if (!summary) return "Requests, members and your invite link";
  const parts = [`${summary.memberCount.toLocaleString("en-PH")} active`];
  if (summary.requestCount) parts.push(countOf(summary.requestCount, "request to answer", "requests to answer"));
  else if (summary.expiredCount) parts.push(`${summary.expiredCount.toLocaleString("en-PH")} to renew`);
  parts.push(summary.term.label);
  return parts.join(" · ");
}

/** Account's Partnership row. */
export function partnershipRowDetail(partnership: Partnership | null): string {
  if (!partnership) return "Member perk and liquidation records";
  return `${countOf(partnership.results.membersOrdered, "member", "members")} ordered · ${countOf(partnership.events.length, "liquidation record", "liquidation records")}`;
}

export function ordersLine(member: Pick<OrganizationMember, "ordersThisTerm">): string {
  return member.ordersThisTerm ? `${countOf(member.ordersThisTerm, "order", "orders")} this term` : "No order yet this term";
}

export function perksUsedLine(member: Pick<OrganizationMember, "perksUsed" | "perksPerTerm">): string {
  return member.perksPerTerm == null ? String(member.perksUsed) : `${member.perksUsed} of ${member.perksPerTerm}`;
}

/* --------------------------------------------------------------------------
   The perk: GRIDGO's figures, always "up to"
   -------------------------------------------------------------------------- */

export function perkHeadline(amountMinor: number): string {
  return `Up to ${formatPhp(amountMinor)} off an order`;
}

export function perkTerms(perk: NonNullable<Partnership["perk"]>): string {
  const until = lastDay(perk.endsAt);
  return `For up to ${countOf(perk.maxOrdersPerTerm, "order", "orders")} per member each term${until ? ` · until ${until}` : ""}`;
}

export const PERK_SMALL_ORDER = "Applied at checkout by itself. A small order may save less.";

export function eventLine(event: OrganizationEvent): string {
  const month = memberSinceLabel(event.month);
  return `${countOf(event.orderCount, "order", "orders")} · ${formatPhp(event.totalMinor)}${month ? ` · ${month}` : ""}`;
}

export function benefitLines(partnership: Partnership): string[] {
  const lines: string[] = [];
  if (partnership.benefits.badge) lines.push("Partner badge on your organization");
  if (partnership.benefits.jointPromos) lines.push("Joint promos on GRIDGO's page");
  if (partnership.benefits.boothSupport) lines.push("Booth support at your events");
  return lines;
}

/* --------------------------------------------------------------------------
   The invite
   -------------------------------------------------------------------------- */

/** The app's own link for a join path. `base` is the app's URL for `/`. */
export function memberInviteLink(base: string, path: string): string {
  return `${base.endsWith("/") ? base : `${base}/`}${path.replace(/^\/+/, "")}`;
}

export function memberInviteMessage(input: { label: string; term: MemberTerm; link: string; downloadUrl: string | null }): string {
  return [
    `Join ${input.label} on GRIDGO for ${input.term.label}. Open this link, then tap Request to join:`,
    input.link,
    "Link not opening? Copy it, then in GRIDGO go to Account, My orgs, Join an org and paste it.",
    ...(input.downloadUrl ? [`No GRIDGO app yet? Get it here first: ${input.downloadUrl}`] : []),
  ].join("\n\n");
}

/* --------------------------------------------------------------------------
   The list check
   -------------------------------------------------------------------------- */

export type ListTotals = Pick<MemberListCheck, "readyCount" | "emailCount" | "mobileCount" | "alreadyListedCount">;

/** What saving does, said before the tap. */
export function saveListLabel(ready: number): string {
  return `Save ${countOf(ready, "person", "people")}`;
}

/* --------------------------------------------------------------------------
   Inbox
   -------------------------------------------------------------------------- */

/** Notices only the organization receives. `membership.confirmed` also goes to the member. */
const OFFICER_NOTICES: ReadonlySet<string> = new Set([
  "membership.requested",
  "membership.request_cancelled",
  "membership.left",
]);

/** A push carries only its type, so it opens Members only when the type is the officer's alone. */
export function isOfficerMemberNotification(type: string | null | undefined): boolean {
  return type != null && OFFICER_NOTICES.has(type);
}

/** An inbox row for the officer. A member gets `membership.confirmed` too, so the account decides. */
export function opensMembers(type: string | null | undefined, accountType: string | null | undefined): boolean {
  return accountType === "organization" && (isOfficerMemberNotification(type) || type === "membership.confirmed");
}

export function opensPartnership(type: string | null | undefined): boolean {
  return type === "organization_partner.set";
}

/* --------------------------------------------------------------------------
   Refusals
   -------------------------------------------------------------------------- */

export function refusal(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body;
  return typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : null;
}

/** The account is not a live partner with an officer: nothing here is theirs to see. */
export function isNotPartner(error: unknown): boolean {
  const code = refusal(error);
  return code === "officer_of_record_required" || code === "organization_partner_required" || code === "membership_required"
    // A GRIDGO from before organization members.
    || (error instanceof ApiError && error.status === 404 && (code === null || code === "not_found"));
}

/** Somebody or something else changed it first: read again before asking. */
export function isStaleMember(error: unknown): boolean {
  const code = refusal(error);
  return code === "membership_stale" || code === "membership_not_pending" || code === "membership_not_active"
    || code === "membership_not_expired" || code === "membership_not_found";
}

export function memberErrorMessage(error: unknown, fallback: string): string {
  switch (refusal(error)) {
    case "officer_of_record_required":
      return "Only the organization's officer of record can open this. Verify your officer under Account, Organizations.";
    case "organization_partner_required":
      return "Your organization is not a GRIDGO partner right now. Message GRIDGO if you think this is wrong.";
    case "membership_stale":
      return "This changed since you opened it. Here is the latest, so check it and try again.";
    case "membership_not_pending":
      return "This request was already answered or cancelled.";
    case "membership_not_active":
      return "This person is no longer a member.";
    case "membership_not_expired":
      return "Some of these are already renewed. The list is up to date now, so choose again.";
    case "membership_not_found":
      return "This person is no longer on your list.";
    case "member_list_entry_not_found":
      return "This person already answered or was taken off.";
    case "invalid_member_since":
      return "Choose the real month and year they joined. It cannot be in the future.";
    case "invalid_member_term":
      return "A new term has started. Go back and open this again.";
    case "invalid_member_list":
      return "Send 1 to 500 people at a time.";
    case "member_list_too_large":
      return "That file is too large. Split it and send each part.";
    case "member_list_daily_limit":
      return "You have reached today's limit for member lists. Try again tomorrow.";
    case "member_list_consent_required":
      return "Tick the box first: your members need to have agreed to this.";
    case "invalid_event_name":
      return "Give the event a name, up to 120 characters.";
    case "event_limit_reached":
      return "You have reached the limit for events. Delete one you no longer need.";
    case "event_order_already_recorded":
      return "One or more of these orders is already in another event. They are unticked now.";
    case "invalid_event_orders":
      return "An event holds up to 200 orders. Untick some and try again.";
    case "event_order_not_found":
      return "One of these orders is no longer available. Check the list and try again.";
    case "organization_event_stale":
      return "This event changed since you opened it. Here is the latest, so check it and try again.";
    case "organization_event_not_found":
      return "This event was deleted.";
    default:
      return userFacingError(error, fallback);
  }
}

/** The check's own message for a field, said for the officer. */
export function fixMessage(code: string, message: string): string {
  switch (code) {
    case "member_name_required":
      return "No name";
    case "invalid_member_contact":
      return "No working email or mobile";
    case "invalid_member_since":
      return "Member since is missing or not a date";
    case "duplicate_member_contact":
      return "Same contact as another row";
    default:
      return message;
  }
}
