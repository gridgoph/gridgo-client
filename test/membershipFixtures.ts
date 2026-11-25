import type { Cart, MemberPerkLine } from "@/lib/api";
import type { Membership, MembershipInvite, MembershipMatch } from "@/lib/membershipsApi";

/** Invented organizations, the way gridgo-api writes them. */
export const TERM = { code: "2026-27", label: "SY 2026-27", endsOn: "2027-05-31" };
export const JOIN_TOKEN = "Abcd1234_efgh5678-Ijkl9012mnop3456";

export function membership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: "mem_1",
    label: "Sample Guild member",
    organizationName: "Sample Guild of Makers",
    partner: true,
    status: "active",
    memberSince: "2025-09",
    term: TERM,
    termsCount: 1,
    requestedAt: "2026-11-03T02:00:00.000Z",
    perk: {
      amountMinor: 1000,
      maxOrdersPerTerm: 5,
      used: 2,
      left: 3,
      validUntil: "2027-05-31T16:00:00.000Z",
      available: true,
      fundedBy: "GRIDGO",
    },
    totalSavedMinor: 2000,
    ...overrides,
  };
}

export function membershipMatch(overrides: Partial<MembershipMatch> = {}): MembershipMatch {
  return {
    id: "mle_1",
    label: "Sample Guild member",
    organizationName: "Sample Guild of Makers",
    memberSince: "2025-09",
    term: TERM,
    expiresAt: "2026-12-25T02:00:00.000Z",
    perk: { amountMinor: 1000, maxOrdersPerTerm: 5, validUntil: "2027-05-31T16:00:00.000Z", budgetAvailable: true },
    ...overrides,
  };
}

export function membershipInvite(overrides: Partial<MembershipInvite> = {}): MembershipInvite {
  return {
    label: "Sample Guild member",
    organizationName: "Sample Guild of Makers",
    term: TERM,
    perk: { amountMinor: 1000, maxOrdersPerTerm: 5, validUntil: "2027-05-31T16:00:00.000Z", budgetAvailable: true },
    membershipStatus: null,
    ...overrides,
  };
}

export const PERK_LINE: MemberPerkLine = {
  membershipId: "mem_1",
  label: "Sample Guild member",
  amountMinor: 400,
  useNumber: 3,
  maxOrdersPerTerm: 5,
  fundedBy: "GRIDGO",
};

/** The basket with a perk on its quote, as gridgo-api prices it: already out of the total. */
export function withMemberPerk(cart: Cart, amountMinor = PERK_LINE.amountMinor): Cart {
  const quote = cart.clientQuote;
  if (!quote || quote.totalMinor == null) throw new Error("withMemberPerk needs a priced quote");
  const totalMinor = quote.totalMinor - amountMinor;
  return {
    ...cart,
    clientQuote: {
      ...quote,
      discountKind: amountMinor ? "member_perk" : null,
      memberPerkMinor: amountMinor,
      memberPerk: amountMinor ? { ...PERK_LINE, amountMinor } : null,
      totalMinor,
      downpaymentMinor: totalMinor,
      balanceMinor: 0,
    },
  };
}
