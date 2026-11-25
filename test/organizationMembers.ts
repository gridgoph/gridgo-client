import type {
  MemberRequest,
  MembersSummary,
  MemberTerm,
  OrganizationEventDetail,
  OrganizationMember,
  Partnership,
} from "@/lib/organizationMembersApi";
import type { User } from "@/lib/api";

/** Invented officer, organization and members for the #474 tests. */

export const TERM: MemberTerm = { code: "2026-27", label: "SY 2026-27", endsOn: "2027-05-31" };
export const LAST_TERM: MemberTerm = { code: "2025-26", label: "SY 2025-26", endsOn: "2026-05-31" };

export const ORG_USER: User = {
  id: "u_org",
  email: "club@example.com",
  name: "Officer Sample",
  role: "client",
  accountType: "organization",
  orgName: "Sample Club",
  approvalCase: { id: "apc_1", kind: "business_client", status: "approved", version: 3 },
};

export const SUMMARY: MembersSummary = { label: "SAMPLE", term: TERM, memberCount: 47, requestCount: 2, expiredCount: 0 };

export const REQUEST: MemberRequest = {
  id: "m_req_1",
  name: "Alex Sample",
  source: "qr",
  requestedAt: "2026-11-25T02:00:00.000Z",
  term: TERM,
  memberSince: null,
  termsCount: 0,
  version: 1,
};

export const MEMBER: OrganizationMember = {
  id: "m_1",
  name: "Bea Example",
  status: "active",
  memberSince: "2024-08-15",
  source: "link",
  term: TERM,
  termsCount: 3,
  requestedAt: "2024-08-15T02:00:00.000Z",
  version: 4,
  ordersThisTerm: 5,
  perksUsed: 1,
  perksPerTerm: 3,
};

export const EXPIRED: OrganizationMember = {
  ...MEMBER,
  id: "m_old",
  name: "Dana Testcase",
  status: "expired",
  term: LAST_TERM,
  termsCount: 1,
  ordersThisTerm: 0,
  perksUsed: 0,
  perksPerTerm: null,
};

export const PARTNERSHIP: Partnership = {
  label: "SAMPLE",
  partnerSince: "2026-06-01",
  benefits: { badge: true, jointPromos: true, boothSupport: false },
  perk: { amountMinor: 2000, maxOrdersPerTerm: 3, endsAt: "2027-05-31T16:00:00.000Z" },
  results: { term: TERM, memberCount: 47, membersOrdered: 18, memberOrders: 31, membersSavedMinor: 54000 },
  events: [
    { id: "ev_1", name: "Sample Week", version: 2, status: "complete", orderCount: 2, totalMinor: 245000, month: "2026-09" },
    { id: "ev_2", name: "Sports Day", version: 1, status: "open", orderCount: 1, totalMinor: 80000, month: "2026-11" },
  ],
};

export const EVENT: OrganizationEventDetail = {
  ...PARTNERSHIP.events[0]!,
  orders: [
    {
      orderId: "ord_3ff0128e105a",
      date: "2026-09-03",
      product: "Tarpaulin 4x8",
      amountMinor: 120000,
      organizationDiscountMinor: 0,
      invoiceNumber: "GG-1",
      state: "completed",
      closed: true,
    },
    {
      orderId: "ord_3ff0128e105b",
      date: "2026-09-05",
      product: "Flyers A5",
      amountMinor: 125000,
      organizationDiscountMinor: 0,
      invoiceNumber: "GG-2",
      state: "completed",
      closed: true,
    },
  ],
};
