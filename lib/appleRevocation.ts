/**
 * Disconnecting Sign in with Apple when an account deletion is requested.
 *
 * App Store Review Guideline 5.1.1(v): an app that offers Sign in with Apple
 * must revoke the person's Apple tokens when they delete their account in the
 * app. Clerk does not promise that, so gridgo-api calls Apple itself
 * (gridgo-api `docs/APPLE_REVOCATION_API.md`, which is authoritative):
 *
 * 1. The deletion request is filed first and survives whatever Apple does.
 *    This app's own request goes to the privacy queue; the revocation route
 *    needs the account-deletion request beside it, which is idempotent.
 * 2. Apple's sheet is shown again (`expo-apple-authentication`, never Clerk,
 *    so the signed-in identity does not change) for a fresh, single-use
 *    `authorizationCode`.
 * 3. That code goes to `POST /me/account-deletion-request/apple-revocation`
 *    with this app's bundle id.
 *
 * A lost answer is retried with the same code, because a replayed code
 * returns the recorded result without spending anything. A fresh Apple
 * sign-in is asked for only when the API says the code is spent, and never
 * after success: a new sign-in can authorize the app again.
 *
 * The code is never logged or persisted. Nothing here claims Apple was
 * disconnected unless the API answered `status: "revoked"`.
 *
 * iPhone only: Android and the web have no Apple sign-in, and an account with
 * no Apple link keeps the deletion flow it always had.
 */

/** This app's iOS bundle id; gridgo-api picks its Apple key by it. */
export const APPLE_REVOCATION_CLIENT_ID = "ph.gridgo.client";

/** The slice of Clerk's user the check needs. */
export type AppleLinkUser = {
  externalAccounts?: readonly { provider?: string | null }[] | null;
};

/** Whether the signed-in Clerk user has an Apple account linked. */
export function hasAppleAccount(user: AppleLinkUser | null | undefined): boolean {
  return user?.externalAccounts?.some((account) => account.provider === "apple") ?? false;
}

/** Only an iPhone can ask Apple again, and only an Apple-linked account needs it. */
export function appleRevocationApplies(
  platformOS: string,
  user: AppleLinkUser | null | undefined,
): boolean {
  return platformOS === "ios" && hasAppleAccount(user);
}

/**
 * What the person can do after a failure.
 *
 * - `retry`: run the step again, reusing the code already held if there is one.
 * - `sign_in`: the code is spent; Apple must be asked for a new one.
 * - `restore_session`: GRIDGO refused the sign-in itself; sign in again. The
 *   code was never used, so it is kept for the next try.
 * - `null`: nothing on this phone will fix it.
 */
export type AppleRevocationNext = "retry" | "sign_in" | "restore_session" | null;

export type AppleRevocationResult =
  | { status: "revoked" }
  /** `code` is the API's error code, or null when there was none. */
  | { status: "failed"; code: string | null; message: string; next: AppleRevocationNext };

const KEPT = "Your deletion request is still with Operations.";

export const APPLE_REVOKED =
  "Sign in with Apple is disconnected from GRIDGO. Apple will no longer sign you in to this app.";
export const APPLE_CANCELLED = `Sign in with Apple was closed, so GRIDGO could not disconnect it from your Apple ID. ${KEPT}`;
export const APPLE_SIGN_IN_FAILED = `Apple's sign-in did not finish, so GRIDGO could not disconnect it from your Apple ID. ${KEPT}`;
export const APPLE_PREPARE_FAILED = `GRIDGO could not get ready to disconnect Sign in with Apple. Check this phone's connection and try again. ${KEPT}`;
export const APPLE_CHECK_FAILED = `GRIDGO could not check whether Sign in with Apple is already disconnected, so it has not asked Apple again. Check this phone's connection and try again. ${KEPT}`;
export const APPLE_NO_ANSWER = `GRIDGO did not hear back about disconnecting Sign in with Apple. Check this phone's connection and try again. ${KEPT}`;
export const APPLE_UNKNOWN_FAILURE = `GRIDGO could not confirm that Sign in with Apple was disconnected. Try again. ${KEPT}`;

/** One entry per documented error code; anything else is unknown. */
const FAILURES: Record<string, { message: string; next: AppleRevocationNext }> = {
  confirmation_required: {
    message: `GRIDGO did not receive your confirmation. Try again. ${KEPT}`,
    next: "retry",
  },
  invalid_apple_client_id: {
    message: `This version of GRIDGO is not set up to disconnect Sign in with Apple. ${KEPT}`,
    next: null,
  },
  invalid_apple_authorization_code: {
    message: `Apple's sign-in expired before GRIDGO could use it. Sign in with Apple again to disconnect it. ${KEPT}`,
    next: "sign_in",
  },
  unauthorized: {
    message: `Your GRIDGO sign-in has ended, so GRIDGO could not disconnect Sign in with Apple. Sign in again, then open Delete account to finish. ${KEPT}`,
    next: "restore_session",
  },
  apple_identity_mismatch: {
    message: `That Apple ID is not the one linked to this GRIDGO account. Sign in with the Apple ID you use for GRIDGO. ${KEPT}`,
    next: "sign_in",
  },
  account_deletion_request_required: {
    message: `GRIDGO could not find your deletion request to attach this to. Try again. ${KEPT}`,
    next: "retry",
  },
  apple_account_not_linked: {
    message: `GRIDGO's records show no Apple ID linked to this account, so it could not disconnect one. ${KEPT}`,
    next: null,
  },
  apple_revocation_in_progress: {
    message: `GRIDGO is still disconnecting Sign in with Apple from an earlier try. Wait a moment, then try again. ${KEPT}`,
    next: "retry",
  },
  clerk_unavailable: {
    message: `GRIDGO could not reach its sign-in service. Try again in a moment. ${KEPT}`,
    next: "retry",
  },
  apple_unavailable: {
    message: `GRIDGO could not reach Apple. Sign in with Apple again to retry. ${KEPT}`,
    next: "sign_in",
  },
  apple_token_exchange_failed: {
    message: `Apple did not accept GRIDGO's request. Wait a few minutes, then sign in with Apple again to retry. ${KEPT}`,
    next: "sign_in",
  },
  apple_identity_invalid: {
    message: `GRIDGO could not verify Apple's answer, so nothing was disconnected. Sign in with Apple again to retry. ${KEPT}`,
    next: "sign_in",
  },
  apple_revocation_failed: {
    message: `Apple did not confirm that Sign in with Apple was disconnected. Sign in with Apple again to retry. ${KEPT}`,
    next: "sign_in",
  },
  apple_revocation_not_configured: {
    message: `Disconnecting Sign in with Apple is not set up on GRIDGO yet, so it is still connected. ${KEPT}`,
    next: null,
  },
};

/** The failure for a documented error code, or the unknown one. */
export function appleRevocationFailure(code: string | null | undefined): AppleRevocationResult {
  const known = code ? FAILURES[code] : undefined;
  return known
    ? { status: "failed", code: code ?? null, ...known }
    : { status: "failed", code: code ?? null, message: APPLE_UNKNOWN_FAILURE, next: "retry" };
}

/** What the route answered: a response body, or an HTTP error carrying one. */
export type AppleRevocationReply =
  | { kind: "answered"; body: unknown }
  | { kind: "refused"; body: unknown }
  | { kind: "lost" };

/** Read one reply. Only an explicit `revoked` status is success. */
export function readAppleRevocationReply(reply: AppleRevocationReply): AppleRevocationResult {
  if (reply.kind === "lost") {
    return { status: "failed", code: null, message: APPLE_NO_ANSWER, next: "retry" };
  }
  const body = reply.body as {
    ok?: unknown;
    error?: unknown;
    appleRevocation?: { status?: unknown } | null;
  } | null;
  if (reply.kind === "answered" && body?.ok === true && body.appleRevocation?.status === "revoked") {
    return { status: "revoked" };
  }
  return appleRevocationFailure(typeof body?.error === "string" ? body.error : null);
}

/** Codes the contract says to retry with the same code, after a short wait. */
const SAME_CODE_AGAIN = new Set(["apple_revocation_in_progress", "clerk_unavailable"]);

export const APPLE_REVOCATION_ATTEMPTS = 3;
export const APPLE_REVOCATION_RETRY_MS = 1500;

export function appleRetryWait(ms = APPLE_REVOCATION_RETRY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The latest attempt the API recorded for this app, if any. */
export function recordedRevocation(
  request: { appleRevocations?: readonly { clientId: string; status: string }[] | null } | null | undefined,
  clientId = APPLE_REVOCATION_CLIENT_ID,
): { status: string } | null {
  return request?.appleRevocations?.find((attempt) => attempt.clientId === clientId) ?? null;
}

/**
 * Send one code, retrying it while the contract says the same code is still
 * good: an answer that never arrived, an attempt already in flight, or Clerk
 * not answering the API. Never asks Apple for anything. `stop` ends the
 * retries early (the screen closed); the code stays good for a later try.
 */
export async function revokeWithSameCode(
  send: () => Promise<AppleRevocationReply>,
  wait: () => Promise<void> = appleRetryWait,
  stop: () => boolean = () => false,
): Promise<AppleRevocationResult> {
  let result: AppleRevocationResult = appleRevocationFailure(null);
  for (let attempt = 0; attempt < APPLE_REVOCATION_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await wait();
      if (stop()) return result;
    }
    const reply = await send();
    result = readAppleRevocationReply(reply);
    const again =
      reply.kind === "lost" ||
      (result.status === "failed" && result.code != null && SAME_CODE_AGAIN.has(result.code));
    if (!again) return result;
  }
  return result;
}

