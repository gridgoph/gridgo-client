/**
 * The client's own account: the details behind the identity card, and the
 * stepped application that turns a personal account into a business one.
 *
 * Two of the outcomes here are not failures, and both exist because of
 * something the client cannot see from their phone.
 *
 * **Not open yet.** The routes are live, but a build can be pointed at an
 * older deployment — `EXPO_PUBLIC_API_URL` is build-time configuration — and a
 * 404 there is not the client's mistake and is not fixed by trying harder. So
 * it is stated plainly rather than shown as a red failure, and, crucially,
 * **nothing is written locally instead**. An account type kept only on the
 * phone would be overwritten by the next `/me` and would meanwhile tell a
 * client they are a business to a platform that has never heard of it.
 *
 * **Stale.** Every correction carries the version it was read at, so a change
 * Operations made in the meantime is offered rather than overwritten.
 */

import * as api from "@/lib/api";
import type { AccountType, ClientAddress, User } from "@/lib/api";
import { withTimeout } from "@/lib/clerkSignIn";
import { userFacingError } from "@/lib/copy";
import { checkSignupField, EMPTY_SIGNUP, needsOrgName } from "@/lib/signup";

/** The details this app may change. Email is a screen of its own, later. */
export type AccountField = "name" | "phone" | "orgName";

/**
 * Reading. There is no `stale` here — a read carries no version, so nothing it
 * does can conflict with a change made elsewhere.
 */
export type ReadOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "not_open_yet" }
  | { status: "failed"; message: string };

/** Writing. `stale` is GRIDGO refusing a write built on a version that moved. */
export type AccountOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "not_open_yet" }
  | { status: "stale" }
  /** `field` is set when GRIDGO named the one detail it would not accept. */
  | { status: "failed"; message: string; field?: AccountField };

/**
 * What a client is told while GRIDGO has no route for this. Names no status
 * code, and says what happens to the answers they already typed.
 */
export const ACCOUNT_NOT_OPEN_YET =
  "GRIDGO has not opened account changes on this app yet. Nothing here is lost — check again shortly, and ask Operations to correct anything that cannot wait.";

export const BUSINESS_APPLY_NOT_OPEN_YET =
  "GRIDGO has not opened business applications on this app yet. Your answers stay on this screen — check again shortly, or ask Operations to review the account.";

/** The record moved under the client. Says so, and what to do about it. */
export const ACCOUNT_STALE =
  "Your account changed somewhere else while this screen was open. Load the latest so nothing you cannot see is overwritten, then make your change again.";

/** 404/405 mean the route is not there. Anything else is a real failure. */
function isRouteAbsent(error: unknown): boolean {
  return error instanceof api.ApiError && (error.status === 404 || error.status === 405);
}

/**
 * GRIDGO refusing a write built on a version that has moved on.
 *
 * Read by code, not by status: `/me` answers 409 for two different things, and
 * `client_profile_unavailable` — an identity with no editable client profile —
 * is not a conflict a client can resolve by loading the latest.
 */
function isStale(error: unknown): boolean {
  return (
    error instanceof api.ApiError &&
    error.status === 409 &&
    apiErrorCode(error) === "account_version_conflict"
  );
}

function apiErrorCode(error: api.ApiError): string | null {
  const body = error.body;
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  return String((body as { error: unknown }).error);
}

/**
 * GRIDGO naming the one field it would not take, so the screen can point at it.
 *
 * `sendDomainError` spreads the error's details over the envelope, so `field`
 * is a top-level key. The API's own names for the contact details on the
 * business application differ from this screen's fields, so they are mapped
 * rather than dropped — a refusal that lands on no field at all becomes a
 * notice the client cannot act on.
 */
function refusedField(error: unknown): AccountField | undefined {
  if (!(error instanceof api.ApiError)) return undefined;
  const body = error.body;
  if (typeof body !== "object" || body === null || !("field" in body)) return undefined;
  switch ((body as { field: unknown }).field) {
    case "name":
    case "contactName":
      return "name";
    case "phone":
    case "contactPhone":
      return "phone";
    case "orgName":
    case "businessName":
      return "orgName";
    default:
      return undefined;
  }
}

/* --------------------------------------------------------------------------
   Phone numbers
   -------------------------------------------------------------------------- */

const LOCAL_MOBILE = /^0(9\d{9})$/;
const INTERNATIONAL_MOBILE = /^\+?63(9\d{9})$/;

/**
 * The same shape `philippineMobileNumber` accepts server-side, checked here so
 * a typo costs a glance rather than a round trip. GRIDGO stores one canonical
 * `+639XXXXXXXXX`, which is why a saved number reads back in that form.
 *
 * Deliberately not folded into `checkSignupField`: sign-up asks for a number
 * before an account exists and takes a looser one, and tightening it there
 * would change a flow nobody asked to change.
 */
export function mobileNumberProblem(value: string): string | null {
  const typed = value.trim();
  if (!typed) return "Enter a number Operations can reach you on about a job.";
  const compact = typed.replaceAll(/[\s()-]/g, "");
  if (!LOCAL_MOBILE.test(compact) && !INTERNATIONAL_MOBILE.test(compact)) {
    return "Enter a Philippine mobile number, for example 0917 123 4567.";
  }
  return null;
}

/* --------------------------------------------------------------------------
   Your details — the draft on screen
   -------------------------------------------------------------------------- */

export type AccountDraft = {
  name: string;
  phone: string;
  /** Only editable where the account trades under a name. */
  orgName: string;
};

/**
 * A client with no number on file edits an empty field, not the word "null".
 *
 * `fallbackName` is the name Clerk has, used only where GRIDGO has none. The
 * two are meant to be the same string and usually are, so seeding from Clerk
 * unconditionally would open the screen already "changed" whenever they were
 * spelled differently — a Save button offered for an edit nobody made. Where
 * GRIDGO genuinely holds no name, though — a Google sign-up leaves it empty
 * while Clerk knows it perfectly well — the field would otherwise be blank
 * next to a heading showing the very name it is missing.
 */
export function draftFromUser(user: User, fallbackName?: string): AccountDraft {
  return {
    name: user.name?.trim() || fallbackName?.trim() || "",
    phone: user.phone ?? "",
    orgName: user.orgName ?? "",
  };
}

/**
 * Only what actually moved.
 *
 * A patch carrying every field would send GRIDGO a name the client never
 * touched, which is the write that loses somebody else's correction even when
 * the version still matches.
 */
export function accountPatch(user: User, draft: AccountDraft): api.AccountPatch {
  const patch: api.AccountPatch = {};
  const name = draft.name.trim();
  const phone = draft.phone.trim();
  const orgName = draft.orgName.trim();

  if (name !== (user.name ?? "")) patch.name = name;
  if (phone !== (user.phone ?? "")) patch.phone = phone;
  if (accountHasOrgName(user) && orgName !== (user.orgName ?? "")) patch.orgName = orgName;
  return patch;
}

export function hasAccountChanges(user: User, draft: AccountDraft): boolean {
  return Object.keys(accountPatch(user, draft)).length > 0;
}

/** True where the account type is one that trades under a name of its own. */
export function accountHasOrgName(user: Pick<User, "accountType">): boolean {
  return needsOrgName(user.accountType ?? "individual");
}

export type AccountProblems = Partial<Record<AccountField, string>>;

/**
 * The same checks sign-up used, in the same words.
 *
 * A client told one thing while opening the account and another while
 * correcting the same field learns that neither sentence means anything, so
 * the wording is imported rather than rewritten.
 */
export function accountProblems(
  draft: AccountDraft,
  accountType: AccountType,
): AccountProblems {
  const problems: AccountProblems = {};
  const fields = { ...EMPTY_SIGNUP, accountType, ...draft };

  const name = checkSignupField("name", fields);
  if (!name.ok && name.reason) problems.name = name.reason;

  const phone = mobileNumberProblem(draft.phone);
  if (phone) problems.phone = phone;

  if (needsOrgName(accountType)) {
    const orgName = checkSignupField("orgName", fields);
    if (!orgName.ok && orgName.reason) problems.orgName = orgName.reason;
  }
  return problems;
}

/* --------------------------------------------------------------------------
   Reading and correcting the account
   -------------------------------------------------------------------------- */

/**
 * How long `/me` gets before the screen stops waiting on it.
 *
 * There is a hard rule behind this number: nothing a client can already see
 * may be held back by this read. **Your details** draws the person from Clerk
 * and from the session that is already in memory, and `/me` only refreshes the
 * number, the organisation name and the version — so a request that never
 * answers has to end by itself rather than leave a screenful of grey bars
 * where an account was. Eight seconds is long enough for a slow LAN and short
 * enough that nobody wonders whether the app has stopped.
 */
export const ACCOUNT_READ_TIMEOUT_MS = 8000;

/** Said quietly, under details that are already on screen and still true. */
export const ACCOUNT_READ_SLOW =
  "GRIDGO is not answering, so your number and organisation name may not be the latest.";

export async function loadAccount(): Promise<ReadOutcome<User>> {
  try {
    return {
      status: "ok",
      value: await withTimeout(api.getAccount(), ACCOUNT_READ_TIMEOUT_MS),
    };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    // A read that ran out of time is not a read that failed: nothing is known
    // to be wrong, and "check your connection" sends a client to look at a
    // phone that is working. It gets its own sentence for that reason.
    if (isTimeout(error)) return { status: "failed", message: ACCOUNT_READ_SLOW };
    return {
      status: "failed",
      message: userFacingError(
        error,
        "GRIDGO could not read your account. Check your connection and try again.",
      ),
    };
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

/**
 * `expectedVersion` is required by GRIDGO, not optional here — a correction
 * that does not say what it was built on is refused outright.
 */
export async function saveAccount(
  patch: api.AccountPatch,
  expectedVersion: number,
): Promise<AccountOutcome<User>> {
  try {
    return { status: "ok", value: await api.patchAccount(patch, expectedVersion) };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    if (isStale(error)) return { status: "stale" };
    return {
      status: "failed",
      field: refusedField(error),
      message: userFacingError(
        error,
        "GRIDGO could not save that change. Try again in a moment.",
      ),
    };
  }
}

/* --------------------------------------------------------------------------
   Apply as a business
   -------------------------------------------------------------------------- */

export type ApplyStepId = "name" | "contact" | "where" | "review";

export type ApplyStep = { id: ApplyStepId; label: string };

export type BusinessApplyDraft = {
  orgName: string;
  nature: string;
  accountType: Extract<AccountType, "business" | "organization">;
  contactName: string;
  phone: string;
  /** A saved address, or null where the client has none yet. */
  addressId: string | null;
};

export function emptyApplyDraft(user: User | null): BusinessApplyDraft {
  return {
    orgName: user?.orgName?.trim() ?? "",
    nature: "",
    accountType: "business",
    contactName: user?.name?.trim() ?? "",
    phone: user?.phone?.trim() ?? "",
    addressId: null,
  };
}

const ALL_STEPS: Record<ApplyStepId, ApplyStep> = {
  name: { id: "name", label: "Business" },
  contact: { id: "contact", label: "Contact" },
  where: { id: "where", label: "Delivery" },
  review: { id: "review", label: "Review" },
};

/**
 * The steps this particular client walks.
 *
 * Contact is dropped when GRIDGO already holds a name and a number: asking a
 * client to retype what is already on their account teaches them that the
 * account does not remember anything, and it is a step of pure friction on the
 * way to an upgrade they have already decided on. It is still shown back on
 * Review, so nothing is submitted unseen.
 */
export function applySteps(user: User | null): ApplyStep[] {
  const known = Boolean(user?.name?.trim()) && Boolean(user?.phone?.trim());
  const ids: ApplyStepId[] = known
    ? ["name", "where", "review"]
    : ["name", "contact", "where", "review"];
  return ids.map((id) => ALL_STEPS[id]);
}

/**
 * What still stops this step, or null. Where is deliberately never a problem:
 * a client with no saved address has nothing to choose, and GRIDGO asks for
 * the drop-off again at checkout anyway.
 */
export function applyStepProblem(
  step: ApplyStepId,
  draft: BusinessApplyDraft,
): string | null {
  switch (step) {
    case "name": {
      const name = checkSignupField("orgName", {
        ...EMPTY_SIGNUP,
        accountType: draft.accountType,
        orgName: draft.orgName,
      }).reason;
      if (name) return name;
      if (!draft.nature.trim()) {
        return draft.accountType === "organization"
          ? "Say what this organization does."
          : "Say what this business does.";
      }
      return null;
    }
    case "contact":
      return (
        applyContactProblems(draft).contactName ?? applyContactProblems(draft).phone ?? null
      );
    case "where":
    case "review":
      return null;
  }
}

/**
 * The contact step's two answers, checked apart.
 *
 * One combined message would land under whichever field the screen happened to
 * put it under — a number rejected for its format, explained beneath the name.
 */
export function applyContactProblems(draft: BusinessApplyDraft): {
  contactName: string | null;
  phone: string | null;
} {
  const name = checkSignupField("name", { ...EMPTY_SIGNUP, name: draft.contactName });
  return {
    contactName: name.ok ? null : name.reason,
    phone: mobileNumberProblem(draft.phone),
  };
}

/**
 * Draft → exactly the body `POST /me/business-application` wants.
 *
 * Address and contact stay on the account; they do not convert the type.
 * Operations reads the name, nature, and requested account type from the case.
 */
export function businessApplyInput(draft: BusinessApplyDraft): api.BusinessApplyInput {
  return {
    businessName: draft.orgName.trim(),
    businessNature: draft.nature.trim(),
    accountType: draft.accountType,
  };
}

export async function submitBusinessApply(
  input: api.BusinessApplyInput,
  idempotencyKey: string,
): Promise<AccountOutcome<User>> {
  try {
    return { status: "ok", value: await api.applyAsBusiness(input, idempotencyKey) };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    return {
      status: "failed",
      field: refusedField(error),
      message: userFacingError(
        error,
        "GRIDGO could not send that application. Try again in a moment.",
      ),
    };
  }
}

/** Saved addresses for the delivery step. A failure is not fatal to the flow. */
export async function loadApplyAddresses(): Promise<ReadOutcome<ClientAddress[]>> {
  try {
    return { status: "ok", value: await api.listAddresses() };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    return {
      status: "failed",
      message: userFacingError(
        error,
        "GRIDGO could not read your saved addresses. You can still finish and set one at checkout.",
      ),
    };
  }
}

/* --------------------------------------------------------------------------
   The identity card
   -------------------------------------------------------------------------- */

/**
 * Up to two initials for the monogram.
 *
 * Deliberately the first letters of the first and last words, so "Davao Print
 * Supply Co" reads DC rather than DP — a client recognises their own account
 * by its ends, and a middle word is the part that changes when a business
 * renames itself.
 */
export function accountInitials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * What this account is called, in the order a client would say it.
 *
 * A business is its business name; a person is their own. `orgName` is read
 * only where the account type says the account has one — inferring "business"
 * from the presence of a name is how the lockup flickers when a profile is
 * edited, and that rule holds here too.
 */
export function accountHeadline(user: User | null): string {
  if (!user) return "Your account";
  if (accountHasOrgName(user) && user.orgName?.trim()) return user.orgName.trim();
  return user.name?.trim() || "Your account";
}

/** The person's own name, where it is not already the headline. */
export function accountSubName(user: User | null): string | null {
  if (!user) return null;
  const headline = accountHeadline(user);
  const name = user.name?.trim();
  return name && name !== headline ? name : null;
}

/** The live business/organization application, if this client has one. */
export function businessApplication(
  user: User | null,
): api.ApprovalCaseSummary | null {
  const approval = user?.approvalCase;
  if (!approval || approval.kind !== "business_client") return null;
  return approval;
}

export function businessApplicationPending(user: User | null): boolean {
  return businessApplication(user)?.status === "pending";
}

/** True while this account may still send a new application from this app. */
export function canApplyAsBusiness(user: User | null): boolean {
  if (!user) return false;
  if ((user.accountType ?? "individual") !== "individual") return false;
  const status = businessApplication(user)?.status;
  return status !== "pending" && status !== "approved";
}
