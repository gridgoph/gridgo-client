/**
 * Approved organization accounts: who may see the Organizations tab, the
 * officer of record, the quarterly confirmation, the organization discount
 * and the spend statement (gridgo-client#160, #164, #165, #166).
 *
 * Pure. Contracts: gridgo-api `docs/ORGANIZATION_ACCOUNTS_API.md` and
 * `docs/ORGANIZATION_MONEY_API.md`.
 *
 * Two money rules from #166 hold everywhere this module is read:
 *
 * - The discount is shown in pesos as its own line, and it is **already out of
 *   the total** GRIDGO sends. It is drawn, never subtracted again.
 * - GRIDGO's fee is never shown. The discount is funded from it, but nothing
 *   here names the fee, its rate, or what is left of it.
 */

import {
  formatPhp,
  type ClientOrganization,
  type StatementPeriod,
  type StatementRow,
  type User,
} from "@/lib/api";

/* --------------------------------------------------------------------------
   The gate
   -------------------------------------------------------------------------- */

/**
 * Whether this account is an organization Operations has approved.
 *
 * `accountType` alone is not enough: sign-up lets a client *declare* an
 * organization, and only an approved case makes it one. During an officer
 * handover the case is pending again while the organization keeps its verified
 * officer and keeps ordering (5 Oct decision on #164) — so a pending case with
 * a current officer is still an approved organization.
 */
export function isApprovedOrganization(
  user: User | null,
  organization: ClientOrganization | null = null,
): boolean {
  if (!user || user.accountType !== "organization") return false;
  if (user.accountStatus && user.accountStatus !== "active") return false;
  const status = user.approvalCase?.status;
  if (status === "approved") return true;
  return status === "pending" && Boolean(organization?.currentOfficer);
}

/* --------------------------------------------------------------------------
   Officer of record
   -------------------------------------------------------------------------- */

export type OfficerState =
  /** One verified officer, nothing open. */
  | "verified"
  /** The quarterly question is open: is this still the officer? */
  | "confirmation_due"
  /** A new officer has applied; the current one stays until Operations approves. */
  | "handover_pending"
  /** The last handover was turned down; the current officer stays. */
  | "handover_rejected"
  /** An approved organization from before officers were recorded. */
  | "no_officer";

export function officerState(organization: ClientOrganization | null): OfficerState {
  if (!organization?.currentOfficer) return "no_officer";
  const status = organization.approvalCase?.status;
  if (status === "pending") return "handover_pending";
  if (status === "rejected") return "handover_rejected";
  if (organization.confirmationRequestedAt) return "confirmation_due";
  return "verified";
}

/** "Confirm <name> is still the officer" — the reminder's one-tap question. */
export function confirmOfficerQuestion(organization: ClientOrganization | null): string {
  const name = organization?.currentOfficer?.fullName?.trim();
  return name ? `Confirm ${name} is still the officer` : "Confirm your officer";
}

/** Who is printed on a statement row: a string, `{ name }` or blank. */
export function officerOfRecordName(value: StatementRow["officerOfRecord"]): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const name = value.fullName ?? value.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  }
  return null;
}

/* --------------------------------------------------------------------------
   Dates — every date here is a Manila calendar day
   -------------------------------------------------------------------------- */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "2026-10-05" or an ISO instant → "5 Oct 2026", read in Manila. */
export function manilaDay(value: string | null | undefined, { year = true } = {}): string | null {
  if (!value) return null;
  let day = value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return null;
    day = new Date(time + 8 * 3_600_000).toISOString().slice(0, 10);
  }
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const month = MONTHS[m - 1];
  if (!month) return null;
  return year ? `${d} ${month} ${y}` : `${d} ${month}`;
}

/** "1 Oct – 31 Dec 2026", or the years on both ends when they differ. */
export function periodRange(from: string, to: string): string {
  if (from === to) return manilaDay(from) ?? from;
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${manilaDay(from, { year: !sameYear }) ?? from} – ${manilaDay(to) ?? to}`;
}

/* --------------------------------------------------------------------------
   The discount
   -------------------------------------------------------------------------- */

/** GRIDGO's discount on something that carries one; 0 when absent or not positive. */
export function organizationDiscountOf(
  source: { organizationDiscountMinor?: number | null } | null | undefined,
): number {
  const minor = source?.organizationDiscountMinor;
  return typeof minor === "number" && Number.isFinite(minor) && minor > 0 ? minor : 0;
}

export const ORGANIZATION_DISCOUNT_LABEL = "Organization discount";

/** "−₱5.00": a true minus, so it never reads as a hyphenated amount. */
export function discountAmount(minor: number): string {
  return `−${formatPhp(minor)}`;
}

export function savedLine(minor: number): string {
  return `You've saved ${formatPhp(minor)} with your Organization account`;
}

/* --------------------------------------------------------------------------
   The statement
   -------------------------------------------------------------------------- */

export type PeriodKind = StatementPeriod["kind"];

export const PERIOD_OPTIONS: { kind: PeriodKind; label: string }[] = [
  { kind: "this_month", label: "This month" },
  { kind: "this_quarter", label: "This quarter" },
  { kind: "custom", label: "Custom" },
];

/** Said on the screen and on both exports. The API's own words. */
export const STATEMENT_NOTICE = "Not a tax document. Official receipts are issued separately.";

/** A custom range GRIDGO will accept: both dates, in order, at most 366 days. */
export function customRangeProblem(from: string, to: string): string | null {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!day.test(from) || !day.test(to)) return "Enter both dates as YYYY-MM-DD.";
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Enter both dates as YYYY-MM-DD.";
  if (end < start) return "The end date comes before the start date.";
  if ((end - start) / 86_400_000 + 1 > 366) return "Choose a period of a year or less.";
  return null;
}

export function orderCountLabel(count: number): string {
  return count === 1 ? "1 order" : `${count} orders`;
}

/* --------------------------------------------------------------------------
   Inbox
   -------------------------------------------------------------------------- */

export const OFFICER_CONFIRMATION_TYPE = "organization_officer_confirmation";
export const ORGANIZATION_NOTICE_TYPE = "organization_notice";

/** Notification types that open the Organizations tab rather than a job. */
export function isOrganizationNotification(type: string | null | undefined): boolean {
  return type === OFFICER_CONFIRMATION_TYPE || type === ORGANIZATION_NOTICE_TYPE
    || type === "organization_officer_confirmed";
}

export const ORGANIZATIONS_ROUTE = "/(tabs)/organizations" as const;

/* --------------------------------------------------------------------------
   Refusals
   -------------------------------------------------------------------------- */

export function organizationErrorMessage(code: string | null): string | null {
  switch (code) {
    case "officer_changed":
      return "The officer changed since this was opened. Pull down to load the latest.";
    case "officer_handover_pending":
      return "A change of officer is with Operations, so there is nothing to confirm until they decide.";
    case "organization_suspended":
      return "This organization account is on hold. Message Operations to sort it out.";
    case "organization_approval_required":
      return "Statements are for organizations Operations has approved.";
    case "invalid_statement_period":
      return "Choose a period of a year or less, with the start before the end.";
    case "statement_total_too_large":
      return "That period is too large to add up. Choose a shorter one.";
    default:
      return null;
  }
}
