import { request, type MemberPerkLine } from "@/lib/api";

/**
 * The student side of organization members (gridgo-api
 * `docs/ORGANIZATION_MEMBERS_API.md`). The officer side has its own file.
 * Every amount here is GRIDGO's and is drawn as sent.
 */

export type MembershipStatus = "pending" | "active" | "expired" | "removed";

export type MembershipTerm = { code: string; label: string; endsOn: string };

/** The perk on one membership. `left` and `used` count this term's orders. */
export type MembershipPerk = {
  amountMinor: number;
  maxOrdersPerTerm: number;
  used: number;
  left: number;
  /** The instant it stops, so the last day is the one before it. */
  validUntil: string;
  available: boolean;
  fundedBy?: string;
};

/** The perk a person would get by confirming or joining. */
export type MembershipPerkOffer = {
  amountMinor: number;
  maxOrdersPerTerm: number;
  currency?: string;
  fundedBy?: string;
  validUntil: string;
  budgetAvailable: boolean;
};

export type Membership = {
  id: string;
  /** "Sample Guild member", as GRIDGO writes it. */
  label: string;
  organizationName: string | null;
  partner: boolean;
  status: MembershipStatus;
  /** `YYYY-MM-DD` or `YYYY-MM`; null until an officer sets it. */
  memberSince: string | null;
  term: MembershipTerm;
  termsCount: number;
  requestedAt: string;
  removedReason?: string | null;
  perk: MembershipPerk | null;
  totalSavedMinor: number;
};

/** An officer's list names this person; nothing is true until they confirm. */
export type MembershipMatch = {
  id: string;
  label: string;
  organizationName: string | null;
  memberSince: string | null;
  term: MembershipTerm;
  expiresAt: string;
  perk: MembershipPerkOffer | null;
};

export type MembershipList = {
  serverTime: string;
  memberships: Membership[];
  matches: MembershipMatch[];
};

export type MembershipInvite = {
  label: string;
  organizationName: string | null;
  term: MembershipTerm;
  perk: MembershipPerkOffer | null;
  membershipStatus: MembershipStatus | null;
};

export type JoinSource = "qr" | "link";

export type { MemberPerkLine };

export async function listMemberships(): Promise<MembershipList> {
  return request<MembershipList>("/me/memberships");
}

/** Asks GRIDGO to match this account's verified email and mobile. */
export async function matchMemberships(): Promise<MembershipList> {
  return request<MembershipList>("/me/memberships/matches", { method: "POST", body: "{}" });
}

export async function confirmMembershipMatch(id: string): Promise<Membership> {
  const result = await request<{ membership: Membership }>(
    `/me/memberships/matches/${encodeURIComponent(id)}/confirm`,
    { method: "POST", body: "{}" },
  );
  return result.membership;
}

export async function dismissMembershipMatch(id: string): Promise<MembershipList> {
  return request<MembershipList>(`/me/memberships/matches/${encodeURIComponent(id)}/dismiss`, {
    method: "POST",
    body: "{}",
  });
}

/** Reads an invite without joining. Every look-up counts against a limit. */
export async function previewMembershipInvite(token: string): Promise<MembershipInvite> {
  const result = await request<{ invite: MembershipInvite }>("/me/memberships/preview", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  return result.invite;
}

export async function requestMembership(token: string, source: JoinSource): Promise<Membership> {
  const result = await request<{ membership: Membership }>("/me/memberships", {
    method: "POST",
    body: JSON.stringify({ token, source }),
  });
  return result.membership;
}

/** Cancels a waiting request, or leaves the organization. */
export async function endMembership(id: string): Promise<Membership> {
  const result = await request<{ membership: Membership }>(`/me/memberships/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return result.membership;
}
