/**
 * Adopt a leftover Clerk session, or clear it so a new attempt can proceed.
 *
 * Restoring a leftover is only for a silent launch (the app already knows
 * who is signed in). An explicit Sign In / Sign Up / Google tap must never
 * adopt a leftover: that leftover may belong to a different person than the
 * credentials just typed.
 */

import { clientEmailUnavailableMessage } from "@/lib/copy";

export type ClerkGetToken = (options?: { skipCache?: boolean }) => Promise<string | null | undefined>;

export type AdoptOrClearClerkSessionInput = {
  isSignedIn: boolean;
  sessionId?: string | null;
  getToken: ClerkGetToken;
  setActive: (args: { session: string }) => Promise<unknown>;
  signOut: () => Promise<unknown>;
  /** Override the short wait for a JWT — tests pass a no-delay sleep. */
  tokenWait?: ClerkTokenWait;
};

export type AdoptOrClearClerkSessionResult =
  | { status: "fresh" }
  | { status: "adopt" }
  | { status: "cleared" }
  | { status: "cleanup_failed"; message: string };

export const clerkSignOutRecoveryMessage =
  "GRIDGO could not sign you out of Clerk. Check your connection and try again.";

/**
 * The password form's "Sign out and try again" control is only for a live
 * Clerk leftover GRIDGO could not drop. A refused email is not signed in to
 * Client — offering sign-out there is the wrong recovery.
 */
export function clerkSignOutRetryLabel(
  sessionError: string | null | undefined,
  localError?: string | null,
): string | undefined {
  if (localError || !sessionError) return undefined;
  if (sessionError === clientEmailUnavailableMessage) return undefined;
  return "Sign out and try again";
}

export const clerkPasswordIncompleteMessage =
  "This account needs another verification step. Please try again.";

export const clerkNeedsNewPasswordMessage =
  "This account has to choose a new password before signing in. Tap “Recover password” to get a code.";

export type ClerkSecondFactorStrategy = "email_code" | "phone_code" | "totp" | "backup_code";

export type PasswordSignInContinuation =
  | { kind: "complete" }
  /** Clerk kept the session it already had instead of creating one. */
  | { kind: "existing_session"; sessionId: string }
  | { kind: "verification"; factor: ClerkSecondFactorStrategy }
  | { kind: "blocked"; message: string };

const SECOND_FACTOR_ORDER: ClerkSecondFactorStrategy[] = [
  "email_code",
  "phone_code",
  "totp",
  "backup_code",
];

/** Email code, else the first second factor Clerk listed. Never throw. */
export function pickSupportedSecondFactor(
  factors?: readonly { strategy: string }[] | null,
): ClerkSecondFactorStrategy {
  const strategies = new Set((factors ?? []).map((factor) => factor.strategy));
  if (strategies.size === 0) return "email_code";
  return SECOND_FACTOR_ORDER.find((strategy) => strategies.has(strategy)) ?? "email_code";
}

/**
 * Password may finish, or Clerk may still need a second factor / new-device
 * email code. Those statuses collect a code; they are not a login failure.
 */
export function continuationAfterPassword(
  status: string | null | undefined,
  supportedSecondFactors?: readonly { strategy: string }[] | null,
  existingSession?: { sessionId: string } | null,
): PasswordSignInContinuation {
  // Clerk reports this instead of creating a second session for the same
  // person. It is the "you are currently logged in" case, and the session it
  // points at is the one to adopt — never a login failure.
  if (existingSession?.sessionId) {
    return { kind: "existing_session", sessionId: existingSession.sessionId };
  }
  if (status === "complete") return { kind: "complete" };
  if (status === "needs_second_factor" || status === "needs_client_trust") {
    return {
      kind: "verification",
      factor: pickSupportedSecondFactor(supportedSecondFactors),
    };
  }
  if (status === "needs_new_password") {
    return { kind: "blocked", message: clerkNeedsNewPasswordMessage };
  }
  return { kind: "blocked", message: clerkPasswordIncompleteMessage };
}

/**
 * True when Clerk is complaining that there is no session to act on.
 *
 * `getToken` and `signOut` both throw this once the session has gone, and the
 * app calls them from effects — an unhandled rejection there is the Metro
 * "Unable to authenticate / You are signed out" flood, not a real failure.
 */
export function isClerkSignedOutError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : typeof error === "string" ? error : ""
  ).toLowerCase();
  if (!message) return false;
  return (
    message.includes("signed out") ||
    message.includes("logged out") ||
    message.includes("no active session") ||
    message.includes("session not found") ||
    message.includes("unable to authenticate")
  );
}

/**
 * Fresh JWT for gridgo-api. Cached leftovers are often expired or empty, and a
 * signed-out Clerk throws rather than returning null — answer null either way.
 */
export async function clerkSessionToken(getToken: ClerkGetToken): Promise<string | null> {
  try {
    const token = (await getToken({ skipCache: true }))?.trim() ?? "";
    return token || null;
  } catch {
    return null;
  }
}

export type ClerkTokenWait = {
  /** Total probes, the first one immediate. */
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Clerk / API calls that hang must not keep the person on a signed-in screen. */
export const CLERK_SIGNOUT_TIMEOUT_MS = 4000;

/**
 * Reject if `promise` has not settled. The timer is cleared on settle so a
 * fast path does not leak, and a late resolution cannot still win.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout"));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * A non-empty JWT, waiting briefly for Clerk to mint one.
 *
 * A completing Clerk step does not make a token available in the same tick:
 * `finalize` / `setActive` resolve, and `getToken` still answers empty (or
 * throws "you are signed out") for a beat while the client swaps sessions.
 * Sending `/auth/me` or activate in that gap means sending them with **no
 * Bearer**, which gridgo-api answers `401 unauthorized` — the same body an
 * unmapped identity gets, which is how a perfectly good sign-in came out as
 * "your session expired". So nothing goes out until a token exists.
 *
 * The first probe is immediate, so a session that already has a token costs
 * nothing; only the empty case waits.
 */
export async function awaitClerkSessionToken(
  getToken: ClerkGetToken,
  wait: ClerkTokenWait = {},
): Promise<string | null> {
  const attempts = Math.max(1, wait.attempts ?? 5);
  const delayMs = wait.delayMs ?? 120;
  const sleep = wait.sleep ?? defaultSleep;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const token = await clerkSessionToken(getToken);
    if (token) return token;
    if (attempt < attempts - 1) await sleep(delayMs);
  }
  return null;
}

/**
 * Sign out of Clerk and say whether the session is really gone. "You are
 * signed out" means it already was, which is success, not a cleanup failure.
 */
export async function releaseClerkSession(
  signOut: () => Promise<unknown>,
  timeoutMs: number = CLERK_SIGNOUT_TIMEOUT_MS,
): Promise<boolean> {
  try {
    await withTimeout(Promise.resolve(signOut()), timeoutMs);
    return true;
  } catch (error) {
    return isClerkSignedOutError(error);
  }
}

function isUnauthorizedProbe(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 401
  );
}

export function emailsMatch(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export type TypedEmailProjection =
  | "unknown"
  | "unmapped"
  | "wrong_role"
  | "same_client"
  | "other_account";

/**
 * What GRIDGO already knows about the typed email, using only a live JWT.
 *
 * Never activates a profile: that path can attach a client membership onto an
 * existing rider. A missing token is unknown, not a client.
 */
export async function projectionForTypedEmail(input: {
  typedEmail: string;
  getToken: ClerkGetToken;
  me: () => Promise<{ email?: string; role?: string }>;
}): Promise<TypedEmailProjection> {
  const token = await clerkSessionToken(input.getToken);
  if (!token) return "unknown";
  try {
    const user = await input.me();
    if (!user?.email) return "unknown";
    if (!emailsMatch(user.email, input.typedEmail)) return "other_account";
    if (user.role !== "client") return "wrong_role";
    return "same_client";
  } catch (error) {
    if (isUnauthorizedProbe(error)) return "unmapped";
    return "unknown";
  }
}

export type VerificationCodeGate = "collect" | "wrong_role";

/**
 * Whether Clerk may email a second-factor / new-device code.
 *
 * A leftover or current projection that is not a client is refused here so
 * the password form can show "email not available" instead of "enter the code".
 * When there is no JWT yet, `emailAvailable` is the GRIDGO lookup for that
 * typed address. A lookup failure must not lock a real client out of device
 * trust, so it collects.
 */
export async function verificationCodeGate(input: {
  typedEmail: string;
  getToken: ClerkGetToken;
  me: () => Promise<{ email?: string; role?: string }>;
  emailAvailable?: (email: string) => Promise<boolean>;
}): Promise<VerificationCodeGate> {
  const projection = await projectionForTypedEmail(input);
  if (projection === "wrong_role") return "wrong_role";
  if (projection === "same_client") return "collect";
  if (!input.emailAvailable) return "collect";
  try {
    return (await input.emailAvailable(input.typedEmail.trim().toLowerCase()))
      ? "collect"
      : "wrong_role";
  } catch {
    return "collect";
  }
}

/**
 * Drop a live leftover so the credentials / Google tap just made can run.
 *
 * Unlike {@link adoptOrClearClerkSession}, a leftover that can still mint a
 * JWT is signed out too. Adopting it would land whoever Clerk already had —
 * not the email that was just typed.
 */
export async function clearClerkSessionForNewAttempt(input: {
  isSignedIn: boolean;
  signOut: () => Promise<unknown>;
}): Promise<AdoptOrClearClerkSessionResult> {
  if (!input.isSignedIn) return { status: "fresh" };
  if (!(await releaseClerkSession(input.signOut))) {
    return { status: "cleanup_failed", message: clerkSignOutRecoveryMessage };
  }
  return { status: "cleared" };
}

/**
 * If Clerk already has a session, activate it and keep it only when it can
 * mint a JWT. A dead leftover (failed Google, expired cache) is signed out
 * so password / Google can run again.
 *
 * The token probe waits a moment because `setActive` above may only just have
 * swapped the session in — but only a moment: a leftover that really has no
 * JWT must be cleared quickly so the password the person just typed can run,
 * rather than leaving them looking at an error they cannot act on.
 */
export async function adoptOrClearClerkSession(
  input: AdoptOrClearClerkSessionInput,
): Promise<AdoptOrClearClerkSessionResult> {
  if (!input.isSignedIn) return { status: "fresh" };

  if (input.sessionId) {
    try {
      await input.setActive({ session: input.sessionId });
    } catch {
      // Already active, or the leftover id cannot be selected.
    }
  }

  const token = await awaitClerkSessionToken(
    input.getToken,
    input.tokenWait ?? { attempts: 2, delayMs: 120 },
  );
  if (token) return { status: "adopt" };

  if (!(await releaseClerkSession(input.signOut))) {
    return { status: "cleanup_failed", message: clerkSignOutRecoveryMessage };
  }
  return { status: "cleared" };
}
