/**
 * The officer's side of organization members: `/me/organization/members`,
 * `/me/organization/partnership` and `/me/organization/events`
 * (gridgo-api `docs/ORGANIZATION_MEMBERS_API.md`, gridgo-client#474).
 *
 * Kept out of `lib/api.ts` so the officer and the member sides can grow apart.
 * Every figure, count and status here is GRIDGO's own; nothing is added up.
 */

import { getApiBase, getAuthToken, request } from "@/lib/api";

const MEMBERS = "/me/organization/members";
const EVENTS = "/me/organization/events";

/** One school year, 1 June to 31 May in Manila. */
export type MemberTerm = { code: string; label: string; endsOn: string };

export type MemberSource = "qr" | "link" | "list";

export type MembersSummary = {
  label: string;
  term: MemberTerm;
  memberCount: number;
  requestCount: number;
  expiredCount: number;
};

export type MemberRequest = {
  id: string;
  name: string;
  source: MemberSource;
  requestedAt: string;
  term: MemberTerm;
  /** A returning member's date from before. Null for somebody new. */
  memberSince: string | null;
  termsCount: number;
  version: number;
};

export type OrganizationMember = {
  id: string;
  name: string;
  status: "pending" | "active" | "expired" | "removed";
  memberSince: string | null;
  source: MemberSource;
  term: MemberTerm;
  termsCount: number;
  requestedAt: string;
  version: number;
  ordersThisTerm: number;
  perksUsed: number;
  perksPerTerm: number | null;
};

export type MemberInvite = { term: MemberTerm; token: string; path: string; createdAt: string; expiresAt: string };

export type MemberFilter = "all" | "ordered" | "not_ordered";
export type MemberStatusFilter = "active" | "expired" | "all";

export type MemberPage = { term: MemberTerm; members: OrganizationMember[]; total: number; nextCursor: string | null };
export type MemberRequestPage = { requests: MemberRequest[]; total: number; nextCursor: string | null };

export type MemberListRow = { name: string; contact: string; memberSince: string };
export type MemberListField = "name" | "contact" | "memberSince";
export type MemberListFix = { row: number; field: MemberListField; code: string; message: string };

/** What was typed, counted. It never says who already has a GRIDGO account. */
export type MemberListCheck = {
  rowCount: number;
  readyCount: number;
  alreadyListedCount: number;
  needsFixCount: number;
  needsFix: MemberListFix[];
  emailCount: number;
  mobileCount: number;
};
export type MemberListSaved = MemberListCheck & { savedCount: number; expiresAt: string | null };

export type MemberListEntry = {
  id: string;
  name: string;
  contactKind: "email" | "mobile";
  contact: string;
  memberSince: string;
  expiresAt: string;
};
export type MemberListEntries = {
  entries: MemberListEntry[];
  nextCursor: string | null;
  counts: { waiting: number; accepted: number; dismissed: number; expired: number; removed: number };
};

export type OrganizationEvent = {
  id: string;
  name: string;
  version: number;
  status: "open" | "complete";
  orderCount: number;
  totalMinor: number;
  /** `YYYY-MM`. */
  month: string;
};
export type OrganizationEventOrder = {
  orderId: string;
  date: string;
  product: string;
  amountMinor: number;
  organizationDiscountMinor: number;
  invoiceNumber: string;
  state: string;
  closed: boolean;
};
export type OrganizationEventDetail = OrganizationEvent & { orders: OrganizationEventOrder[] };

export type Partnership = {
  label: string;
  partnerSince: string;
  benefits: { badge: boolean; jointPromos: boolean; boothSupport: boolean };
  perk: { amountMinor: number; maxOrdersPerTerm: number; endsAt: string } | null;
  results: {
    term: MemberTerm;
    memberCount: number;
    membersOrdered: number;
    memberOrders: number;
    membersSavedMinor: number;
  };
  events: OrganizationEvent[];
};

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const memberPath = (id: string, action = "") => `${MEMBERS}/${encodeURIComponent(id)}${action}`;
const eventPath = (id: string, action = "") => `${EVENTS}/${encodeURIComponent(id)}${action}`;

export function getMembersSummary(): Promise<MembersSummary> {
  return request(`${MEMBERS}/summary`);
}

export function listMemberRequests(after: string | null = null): Promise<MemberRequestPage> {
  return request(`${MEMBERS}/requests${after ? `?after=${encodeURIComponent(after)}` : ""}`);
}

export function listMembers(
  input: { q?: string; filter?: MemberFilter; status?: MemberStatusFilter; after?: string | null; limit?: number } = {},
): Promise<MemberPage> {
  const query = new URLSearchParams();
  if (input.q?.trim()) query.set("q", input.q.trim());
  if (input.filter && input.filter !== "all") query.set("filter", input.filter);
  if (input.status) query.set("status", input.status);
  if (input.after) query.set("after", input.after);
  if (input.limit) query.set("limit", String(input.limit));
  const text = query.toString();
  return request(text ? `${MEMBERS}?${text}` : MEMBERS);
}

export async function getMember(id: string): Promise<OrganizationMember> {
  return (await request<{ member: OrganizationMember }>(memberPath(id))).member;
}

export async function approveMember(id: string, expectedVersion: number, memberSince: string, term: string) {
  return (
    await request<{ member: OrganizationMember }>(
      memberPath(id, "/approve"),
      json("POST", { expectedVersion, memberSince, term }),
    )
  ).member;
}

export async function declineMember(id: string, expectedVersion: number): Promise<void> {
  await request(memberPath(id, "/decline"), json("POST", { expectedVersion }));
}

export async function editMemberSince(id: string, expectedVersion: number, memberSince: string) {
  return (
    await request<{ member: OrganizationMember }>(memberPath(id), json("PATCH", { expectedVersion, memberSince }))
  ).member;
}

export async function removeMember(id: string, expectedVersion: number): Promise<void> {
  await request(memberPath(id), json("DELETE", { expectedVersion }));
}

export async function renewMember(id: string, expectedVersion: number) {
  return (
    await request<{ member: OrganizationMember }>(memberPath(id, "/renew"), json("POST", { expectedVersion }))
  ).member;
}

/** All or none, 500 at most. */
export function renewMembers(memberIds: string[]): Promise<{ renewed: string[]; term: MemberTerm }> {
  return request(`${MEMBERS}/renew`, json("POST", { memberIds }));
}

export async function getMemberInvite(): Promise<MemberInvite | null> {
  return (await request<{ invite: MemberInvite | null }>(`${MEMBERS}/invite`)).invite;
}

/** Makes the term's link, or with `replace` a new one that stops the old one. */
export async function createMemberInvite(replace = false): Promise<MemberInvite> {
  return (
    await request<{ invite: MemberInvite }>(`${MEMBERS}/invite`, json("POST", replace ? { replace: true } : {}))
  ).invite;
}

export async function checkMemberList(rows: MemberListRow[]): Promise<MemberListCheck> {
  return (await request<{ check: MemberListCheck }>(`${MEMBERS}/list/check`, json("POST", { rows }))).check;
}

export async function saveMemberList(rows: MemberListRow[]): Promise<MemberListSaved> {
  return (
    await request<{ list: MemberListSaved }>(`${MEMBERS}/list`, json("POST", { rows, consent: true }))
  ).list;
}

export function getMemberListEntries(after: string | null = null): Promise<MemberListEntries> {
  return request(`${MEMBERS}/list${after ? `?after=${encodeURIComponent(after)}` : ""}`);
}

export async function removeMemberListEntry(id: string): Promise<void> {
  await request(`${MEMBERS}/list/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getPartnership(): Promise<Partnership> {
  return (await request<{ partnership: Partnership }>("/me/organization/partnership")).partnership;
}

export async function listOrganizationEvents(): Promise<OrganizationEvent[]> {
  return (await request<{ events: OrganizationEvent[] }>(EVENTS)).events;
}

export async function getOrganizationEvent(id: string): Promise<OrganizationEventDetail> {
  return (await request<{ event: OrganizationEventDetail }>(eventPath(id))).event;
}

export async function createOrganizationEvent(name: string, orderIds: string[]): Promise<OrganizationEventDetail> {
  return (await request<{ event: OrganizationEventDetail }>(EVENTS, json("POST", { name, orderIds }))).event;
}

export async function updateOrganizationEvent(
  id: string,
  body: { expectedVersion: number; name: string; orderIds: string[] },
): Promise<OrganizationEventDetail> {
  return (await request<{ event: OrganizationEventDetail }>(eventPath(id), json("PATCH", body))).event;
}

export async function deleteOrganizationEvent(id: string, expectedVersion: number): Promise<void> {
  await request(eventPath(id), json("DELETE", { expectedVersion }));
}

/** What downloading an event's pack needs; `lib/fileSave.ts` keeps the file. */
export async function eventPackRequest(
  id: string,
  format: "pdf" | "csv",
): Promise<{ url: string; headers: Record<string, string> }> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { Accept: format === "pdf" ? "application/pdf" : "text/csv" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers["X-GRIDGO-Role"] = "client";
  }
  return { url: `${getApiBase()}${eventPath(id, `/pack?format=${format}`)}`, headers };
}
