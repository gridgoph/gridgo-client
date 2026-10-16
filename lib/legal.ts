/**
 * GRIDGO's legal documents, the agreements a client makes, and the privacy
 * requests they can send (gridgo-api `docs/LEGAL_API.md`, report 879B25FC).
 *
 * The rules live here so screens only draw them:
 * - which documents sign-up, the artwork box and the library name, by slot;
 * - the exact bodies an agreement is recorded with — always the version IDs
 *   the client was shown, never a hard-coded "version 1";
 * - how a version, a placeholder and a privacy request are worded.
 *
 * Text is plain text. Nothing here ever turns a document into HTML.
 */

import {
  ApiError,
  type ArtworkRightsBody,
  type EnrollmentConsentBody,
  type LegalAcceptanceContext,
  type LegalVersion,
  type PrivacyRequest,
  type PrivacyRequestKind,
} from "@/lib/api";
import type { OrderStatusTone } from "@/lib/orderState";
import type { Href } from "expo-router";

export const TERMS_ID = "terms-of-service";
export const PRIVACY_ID = "privacy-notice";
export const ARTWORK_RIGHTS_ID = "acceptable-use";

/** What a client agrees to before an account exists. */
export const SIGNUP_DOCUMENT_IDS = [TERMS_ID, PRIVACY_ID] as const;

/**
 * The library's reading order: the two agreements first, then the policies
 * that apply to everyone. Slots GRIDGO adds later follow, by title.
 */
const LIBRARY_ORDER = [TERMS_ID, PRIVACY_ID, ARTWORK_RIGHTS_ID, "age-policy", "cookie-notice"];

export function libraryOrder(documents: readonly LegalVersion[]): LegalVersion[] {
  const rank = (id: string) => {
    const at = LIBRARY_ORDER.indexOf(id);
    return at === -1 ? LIBRARY_ORDER.length : at;
  };
  return [...documents].sort(
    (a, b) => rank(a.documentId) - rank(b.documentId) || a.title.localeCompare(b.title),
  );
}

/** The reader for exactly this version — a stable link to what was agreed to. */
export function legalDocumentHref(doc: Pick<LegalVersion, "id">): Href {
  return { pathname: "/legal/[versionId]", params: { versionId: doc.id } } as Href;
}

export function documentFor(
  documents: readonly LegalVersion[] | null | undefined,
  documentId: string,
): LegalVersion | null {
  return documents?.find((doc) => doc.documentId === documentId) ?? null;
}

/** Terms and Privacy, or null while either is missing from the library. */
export function signupDocuments(
  documents: readonly LegalVersion[] | null | undefined,
): LegalVersion[] | null {
  const found = SIGNUP_DOCUMENT_IDS.map((id) => documentFor(documents, id));
  return found.every(Boolean) ? (found as LegalVersion[]) : null;
}

/** "Terms of Service and Privacy Notice", for one checkbox naming several. */
export function joinTitles(documents: readonly Pick<LegalVersion, "title">[]): string {
  const titles = documents.map((doc) => doc.title);
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

const DATE_PARTS = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "9 Oct 2026" in Davao time, whatever order the runtime's locale data prefers. */
export function legalDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const parts = Object.fromEntries(
    DATE_PARTS.formatToParts(at).map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}`;
}

/** "Version 2, in effect from 9 Oct 2026". */
export function versionLine(doc: Pick<LegalVersion, "version" | "effectiveAt">): string {
  const date = legalDate(doc.effectiveAt);
  return date ? `Version ${doc.version}, in effect from ${date}` : `Version ${doc.version}`;
}

/** Icon names from `StatusChip`'s registry; the chip owns the glyphs. */
export type LegalStatusLook = {
  tone: OrderStatusTone;
  label: string;
  icon: "square-pen" | "circle-check" | "circle-x" | "clock";
};

/**
 * A placeholder is said in words every time it is drawn. Agreeing to one does
 * not stand in for agreeing to the real text, and the client should know which
 * they are reading.
 */
export function legalStatusLook(doc: Pick<LegalVersion, "placeholder" | "status">): LegalStatusLook {
  if (doc.placeholder || doc.status === "placeholder") {
    return { tone: "warning", label: "Placeholder", icon: "square-pen" };
  }
  return { tone: "success", label: "In effect", icon: "circle-check" };
}

export const PLACEHOLDER_NOTE =
  "This is placeholder text. GRIDGO will publish the reviewed document here, and ask you to agree to it then.";

/**
 * The change note worth showing: a later version's own summary. The launch
 * placeholders all say "Launch placeholder", which tells a reader nothing the
 * Placeholder chip does not.
 */
export function changeNote(doc: Pick<LegalVersion, "version" | "changeSummary">): string | null {
  const summary = doc.changeSummary?.trim();
  if (!summary || doc.version <= 1) return null;
  return summary;
}

// ---------------------------------------------------------------------------
// Agreeing
// ---------------------------------------------------------------------------

/** The sign-up answers. `adult` is null until the client says. */
export type SignupConsent = {
  agreed: boolean;
  adult: boolean | null;
  guardian: boolean;
  marketing: boolean;
};

export const EMPTY_SIGNUP_CONSENT: SignupConsent = {
  agreed: false,
  adult: null,
  guardian: false,
  marketing: false,
};

/** Why sign-up cannot go yet, in the order the boxes are drawn. */
export function signupConsentProblem(consent: SignupConsent): string | null {
  if (consent.adult === null) return "Say whether you are 18 or older.";
  if (consent.adult === false && !consent.guardian) {
    return "Under 18, a parent or guardian has to agree with you. Tick the guardian box.";
  }
  if (!consent.agreed) return "Tick the box to agree to the Terms of Service and Privacy Notice.";
  return null;
}

export function enrollmentConsentBody(
  versionIds: string[],
  consent: SignupConsent,
  context: LegalAcceptanceContext,
): EnrollmentConsentBody {
  const junior = consent.adult === false;
  return {
    accepted: true,
    versionIds,
    method: "checkbox",
    junior,
    ...(junior ? { guardian: consent.guardian } : {}),
    marketing: consent.marketing,
    ...context,
  };
}

export function artworkRightsBody(
  versionId: string,
  context: LegalAcceptanceContext,
): ArtworkRightsBody {
  return { accepted: true, versionIds: [versionId], method: "checkbox", ...context };
}

/** Codes gridgo-api answers when an agreement could not be recorded. */
const LEGAL_REFUSALS = new Set([
  "legal_consent_required",
  "legal_version_changed",
  "invalid_legal_versions",
  "invalid_acceptance_metadata",
  "unsupported_legal_consent_version",
  "legal_audience_mismatch",
  "artwork_rights_required",
]);

function refusalCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : null;
}

export function isLegalRefusal(error: unknown): boolean {
  const code = refusalCode(error);
  return code != null && LEGAL_REFUSALS.has(code);
}

/** A newer version took effect while the client was reading. */
export function isLegalVersionChanged(error: unknown): boolean {
  return refusalCode(error) === "legal_version_changed";
}

export const LEGAL_VERSION_CHANGED =
  "GRIDGO published a newer version while you were reading. Read it, then agree again.";

export const ARTWORK_RIGHTS_UNREAD =
  "GRIDGO could not load its artwork rights statement. Check this phone's connection and try again.";

export const ARTWORK_RIGHTS_REFUSED =
  "GRIDGO could not record your artwork statement. Tick the box again, then place the order.";

/** An API without the legal library answers its routes 404. */
export function isLegalUnsupported(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

// ---------------------------------------------------------------------------
// The blocking screen and notices
// ---------------------------------------------------------------------------

/** See `store/legalConsent.ts` for what each state means. */
export type LegalGateStatus = "unknown" | "clear" | "blocked";

/** "Agree to GRIDGO's terms", or "GRIDGO's terms have changed" for a later version. */
export function gateHeading(pending: readonly Pick<LegalVersion, "version">[]): string {
  return pending.some((doc) => doc.version > 1)
    ? "GRIDGO's terms have changed"
    : "Agree to GRIDGO's terms";
}

export function gateBody(pending: readonly Pick<LegalVersion, "version">[]): string {
  return pending.some((doc) => doc.version > 1)
    ? "Read what changed, then agree to keep using GRIDGO. Your orders are safe while you read."
    : "Read them, then agree to keep using GRIDGO. Your orders are safe while you read.";
}

/** Notices this phone has not shown yet. */
export function unseenNotices(
  notices: readonly LegalVersion[],
  seen: readonly string[],
): LegalVersion[] {
  return notices.filter((doc) => !seen.includes(doc.id));
}

export function noticeHeading(notices: readonly Pick<LegalVersion, "title" | "version">[]): string {
  const updated = notices.some((doc) => doc.version > 1);
  if (notices.length === 1) {
    return updated ? `GRIDGO updated its ${notices[0].title}` : `New to read: ${notices[0].title}`;
  }
  return updated
    ? `GRIDGO updated ${notices.length} policies`
    : `${notices.length} GRIDGO policies to read`;
}

/** The banner's line: which ones, and that nothing is asked of the client. */
export function noticeBody(notices: readonly Pick<LegalVersion, "title">[]): string {
  const which = notices.length > 1 ? `${joinTitles(notices)}. ` : "";
  const where = notices.length > 1 ? "They stay" : "It stays";
  return `${which}Nothing to agree to. ${where} in Account, under Legal & Privacy.`;
}

// ---------------------------------------------------------------------------
// Privacy requests
// ---------------------------------------------------------------------------

export type PrivacyKindCopy = {
  title: string;
  /** The row's line on the Privacy screen. */
  detail: string;
  /** The request screen's opening paragraph. */
  explain: string;
  detailsLabel: string;
  detailsHelper: string;
  /** True when the request means little without the details. */
  detailsRequired: boolean;
};

export const PRIVACY_KINDS: Record<Exclude<PrivacyRequestKind, "deletion">, PrivacyKindCopy> = {
  access: {
    title: "See my data",
    detail: "Ask for a copy of the personal data GRIDGO holds about you",
    explain:
      "GRIDGO will check it is you, then send you a copy of the personal data it holds about you: your account, orders, addresses and messages.",
    detailsLabel: "Anything in particular?",
    detailsHelper: "For example, only your orders from this year.",
    detailsRequired: false,
  },
  correction: {
    title: "Correct my data",
    detail: "Tell GRIDGO about something it has wrong",
    explain:
      "Say what is wrong and what it should be. Your name and number you can fix yourself in Your details; use this for anything else.",
    detailsLabel: "What should GRIDGO correct?",
    detailsHelper: "For example: the delivery address on order GG-1234 is missing the floor.",
    detailsRequired: true,
  },
};

export const DELETION_ROW = {
  title: "Delete my account",
  detail: "Ask GRIDGO to delete your account and personal data",
};

/**
 * Said wherever deletion is offered and once a request is sent: the records
 * GRIDGO must keep, and why, so "deleted" never promises more than it can.
 */
export const RETENTION_NOTE =
  "Some records stay, because the law requires GRIDGO to keep them: invoices and receipts for your orders, payment records, and the record of what you agreed to. GRIDGO tells you which ones it kept when it finishes your request.";

export const PRIVACY_REQUEST_FAILED =
  "Your request did not reach GRIDGO. Check this phone's connection and try again.";

export function privacyKindTitle(kind: string): string {
  if (kind === "deletion") return "Delete my account";
  if (kind === "access" || kind === "correction") return PRIVACY_KINDS[kind].title;
  return "Privacy request";
}

export function privacyStatusLook(status: string): LegalStatusLook {
  switch (status) {
    case "in_progress":
      return { tone: "info", label: "In progress", icon: "clock" };
    case "completed":
      return { tone: "success", label: "Done", icon: "circle-check" };
    case "rejected":
      return { tone: "error", label: "Declined", icon: "circle-x" };
    case "pending":
      return { tone: "neutral", label: "Received", icon: "clock" };
    default:
      return { tone: "neutral", label: "Received", icon: "clock" };
  }
}

/** "Sent 9 Oct 2026, answer due by 24 Oct 2026", or the finish when there is one. */
export function privacyRequestLine(request: Pick<PrivacyRequest, "status" | "requestedAt" | "dueAt" | "updatedAt">): string {
  const sent = legalDate(request.requestedAt);
  if (request.status === "completed" || request.status === "rejected") {
    const closed = legalDate(request.updatedAt);
    return [sent ? `Sent ${sent}` : null, closed ? `closed ${closed}` : null]
      .filter(Boolean)
      .join(", ");
  }
  const due = legalDate(request.dueAt);
  return [sent ? `Sent ${sent}` : null, due ? `answer due by ${due}` : null]
    .filter(Boolean)
    .join(", ");
}

/** Open requests of this kind — a second one is allowed, but said first. */
export function openRequestOf(
  requests: readonly PrivacyRequest[],
  kind: string,
): PrivacyRequest | null {
  return (
    requests.find(
      (request) =>
        request.kind === kind && (request.status === "pending" || request.status === "in_progress"),
    ) ?? null
  );
}
